import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {articleKey,requestKey,urlAliases} from '../src/newsFlow/identity.mjs';
import {originalPublicationContract} from '../src/web/newsOriginalPublicationContract.mjs';
import {weeklyIndex} from '../src/web/newsParser.mjs';

const root=process.argv[2], mode=process.argv[3];
if(!root||!['audit','admit','sitemap','expanded','routes','recover','verify'].includes(mode))throw Error('Expected a working directory and reconciliation mode');
const registry=await loadNewsRegistry();
const database='/var/lib/news-flow/news-flow-runtime/write.sqlite';
const env=dotenv.parse(await fs.readFile('/etc/news-flow/news.env'));
const es=new ES.Client({apiVersion:'5.6',host:env.ES5_HOST,log:[],maxRetries:2,requestTimeout:60000});
const candidates=new Map(), admissionPath=path.join(root,'admitted.jsonl');
const files=new Map();
for(const directory of ['sites','sites-expanded','sites-complete','sites-rechecked']){
 const source=path.join(root,directory);
 const names=await fs.readdir(source).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 for(const name of names)if(name.endsWith('.json'))files.set(name,path.join(source,name));
}
const samples=[];
for(const name of ['failure-samples.jsonl','recovery-all.jsonl','recovery-vtc.jsonl','recovery-jkn.jsonl','recovery-jkn-edited.jsonl','recovery-phunumoi.jsonl','recovery-phunumoi-feed.jsonl','recovery-blogtamsu.jsonl']){
 const raw=await fs.readFile(path.join(root,name),'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
 for(const line of raw.trim().split('\n').filter(Boolean))samples.push(JSON.parse(line));
}
const admittedRows=(await fs.readFile(admissionPath,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e))).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const admitted=new Set(admittedRows.map(row=>articleKey(row.url)));
const requeued=new Set(admittedRows.filter(row=>row.status==='requeued').map(row=>articleKey(row.url)));
let endpointSites=0, openSitemaps=0, aliasSites=0;
function add(candidate){
 const source=registry.sources.get(candidate.site);
 if(source&&registry.byUrl(candidate.url)?.domain===source.domain)candidates.set(articleKey(candidate.url),candidate);
}
if(mode!=='routes')for(const file of files.values()){
 const report=JSON.parse(await fs.readFile(file,'utf8'));
 if(report.attempts.some(a=>['rss','feed','rdf:rdf','urlset','sitemapindex'].includes(a.format)))endpointSites++;
 if(report.unfetched)openSitemaps++;
 if(report.aliasOf)aliasSites++;
 for(const row of report.candidates) add({...row,site:report.site});
}
if(mode==='routes'){
 const directory=path.join(root,'no-feed-routes');
 for(const name of await fs.readdir(directory)){
  const report=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
  for(const url of report.candidates)add({site:report.site,url,kind:'publisher_listing'});
 }
}else for(const row of samples)if(row.state==='done'&&registry.byUrl(row.verified?.proof?.url)?.domain===row.site&&originalPublicationContract(row.verified.proof))add({...row,kind:'verified_recovery'});
if(mode==='verify')for(const row of admittedRows)if(!candidates.has(articleKey(row.url)))add(row);
const today=Date.now();
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'});
const sitemapDays=Array.from({length:8},(_,i)=>dateFormat.format(today-i*86400000));
const recentPath=new RegExp('(?:/|[-_])(?:'+sitemapDays.flatMap(day=>[day.replaceAll('-',''),day.replaceAll('-','[/-]')]).join('|')+')(?:[0-9_./-]|$)');
const baseline=new Set();
if(mode==='expanded')for(const name of files.keys()){
 const report=JSON.parse(await fs.readFile(path.join(root,process.argv.includes('--last-pass')?'sites-expanded':'sites',name),'utf8'));
 for(const row of report.candidates)if(row.kind!=='sitemap_lastmod'||recentPath.test(new URL(row.url).pathname))baseline.add(articleKey(row.url));
}
const rows=[...candidates.entries()].filter(([key,row])=>{
 if(mode==='verify')return admitted.has(key);
 if(mode==='recover')return row.kind==='verified_recovery';
 if(mode==='sitemap')return row.kind==='sitemap_lastmod'&&recentPath.test(new URL(row.url).pathname);
 if(mode==='expanded')return !baseline.has(key)&&row.kind!=='verified_recovery'&&(row.kind!=='sitemap_lastmod'||recentPath.test(new URL(row.url).pathname));
 return !['sitemap_lastmod','verified_recovery'].includes(row.kind);
});
const recentIndexes=[...new Set(Array.from({length:9},(_,i)=>weeklyIndex(new Date(today-i*86400000).toISOString(),'Asia/Ho_Chi_Minh')))];
let state, db, out, missingOut;
const totals={mode,sites:files.size,registrySites:registry.sources.size,endpointSites,aliasSites,openSitemaps,allCandidates:candidates.size,candidates:rows.length,recentIndexes,indexed:0,missing:0,admitted:0,statuses:{}};
try{
 if(['admit','sitemap','expanded','routes','recover'].includes(mode)){
  state=await ThreeFlowState.open(database);
  state.configureSites(registry.sources.values());
  state.db.exec('PRAGMA busy_timeout=15000');
  db=state.db;
  out=await fs.open(admissionPath,'a',0o600);
 }else db=new DatabaseSync(database,{readOnly:true});
 if(mode==='verify'){
  missingOut=await fs.open(path.join(root,'verify-missing.jsonl'),'w',0o600);
  const resolvedGaps=new Map();
  for(const name of ['historical-gap-check.json','historical-held-gap-check.json','canonical-gap-check.json','canonical-gap-check-routes.json','canonical-gap-check-sitemaps.json','canonical-gap-check-tuoitre.json']){
   const raw=await fs.readFile(path.join(root,name),'utf8').catch(error=>error.code==='ENOENT'?'[]':Promise.reject(error));
   for(const row of JSON.parse(raw))if(row.hit?.id&&row.hit.index)resolvedGaps.set(articleKey(row.url),{id:row.hit.id,index:row.hit.index,proof:{url:row.original||row.hit.url||row.url}});
  }
  for(const name of (await fs.readdir(root)).filter(name=>/^remaining-.*\.jsonl$/.test(name))){
   for(const line of (await fs.readFile(path.join(root,name),'utf8')).trim().split('\n').filter(Boolean)){
    const row=JSON.parse(line);
    if(row.recovered&&row.document?.id&&row.document.index&&row.document.url)resolvedGaps.set(articleKey(row.url),{id:row.document.id,index:row.document.index,proof:{url:row.document.url}});
   }
  }
  const receipts=new Map();
  for(const receipt of db.prepare("SELECT url,es_id,es_index FROM import_receipts WHERE imported_at>=? AND status IN ('created','existing')").iterate(today-86400000)){
   const key=articleKey(receipt.url);
   if(admitted.has(key))receipts.set(key,receipt);
  }
  const languagePairs=JSON.parse(await fs.readFile(path.join(root,'language-paths-proven.json'),'utf8').catch(error=>error.code==='ENOENT'?'[]':Promise.reject(error)));
  for(const row of languagePairs){
   const receipt=receipts.get(articleKey(row.canonical));
   if(receipt)resolvedGaps.set(articleKey(row.url),{id:receipt.es_id,index:receipt.es_index,proof:{url:receipt.url}});
  }
  for(const [key,row] of rows){
   const receipt=receipts.get(key);
   if(receipt)row.verified={id:receipt.es_id,index:receipt.es_index,proof:{url:receipt.url}};
   else if(resolvedGaps.has(key))row.verified=resolvedGaps.get(key);
  }
  rows.sort((a,b)=>Number(!!b[1].verified?.id)-Number(!!a[1].verified?.id));
 }
 const query=db.prepare('SELECT parse_status,error,site FROM article_links WHERE parse_key=?');
 for(let offset=0;offset<rows.length;offset+=100){
  const batch=rows.slice(offset,offset+100), aliases=[...new Set(batch.flatMap(([,row])=>[...urlAliases(row.url),...(row.verified?.proof.url!==row.url&&row.verified?[row.verified.proof.url]:[])]))];
  const index=[...new Set([...recentIndexes,...batch.map(([,row])=>row.verified?.index).filter(Boolean)])];
  let existing;
  if(batch.every(([,row])=>row.verified?.id&&row.verified.index)){
   const result=await es.mget({body:{docs:batch.map(([,row])=>({_index:row.verified.index,_type:'newsTopic',_id:row.verified.id,_source:['url']}))}});
   if(result.docs.some(doc=>doc.error&&doc.error.type!=='index_not_found_exception'))throw Error('ES_COVERAGE_MGET_INCOMPLETE');
   existing=new Set(result.docs.filter(doc=>doc.found).map(doc=>articleKey(doc._source.url)));
  }else{
   const result=await es.search({index,type:'newsTopic',ignoreUnavailable:true,body:{size:aliases.length*2,sort:['_doc'],_source:['url'],query:{constant_score:{filter:{terms:{url:aliases}}}}}});
   if(result.timed_out||result._shards.failed||result.hits.total>result.hits.hits.length)throw Error('ES_COVERAGE_QUERY_INCOMPLETE');
   existing=new Set(result.hits.hits.map(hit=>articleKey(hit._source.url)));
  }
  for(const [key,row] of batch){
   if(existing.has(key)||row.verified&&existing.has(articleKey(row.verified.proof.url))){totals.indexed++;continue;}
   totals.missing++;
   let status=query.get(key)?.parse_status||'unseen';
   if(state&&(!admitted.has(key)||mode==='recover'&&!requeued.has(key))){
    const change=state.tx(()=>{
     const current=query.get(key);
     if(!current)return state.discover(row.url,row.site)?'added':null;
     if(row.kind!=='verified_recovery'||current.site!==row.site||current.parse_status!=='fail'||current.error!==row.error)return null;
     const now=Date.now();
     state.db.prepare("UPDATE article_links SET parse_status='pending',error=NULL,task_id=NULL,findtime=?,reviewed_at=? WHERE parse_key=?").run(now,now,key);
     for(const url of urlAliases(row.url))state.db.prepare("DELETE FROM url_failures WHERE role='article' AND url_key=?").run(requestKey(url));
     return 'requeued';
    });
    if(change){
     status=change;totals.admitted++;admitted.add(key);
     if(change==='requeued')requeued.add(key);
     await out.appendFile(JSON.stringify({site:row.site,url:row.url,status,kind:row.kind})+'\n');
    }
   }
   totals.statuses[status]=(totals.statuses[status]||0)+1;
   if(missingOut)await missingOut.appendFile(JSON.stringify({site:row.site,url:row.url,status,identity:row.verified||null})+'\n');
  }
 }
 const report=mode==='expanded'&&process.argv.includes('--last-pass')?
  (files.size===registry.sources.size&&[...files.values()].every(file=>/\/(?:sites-complete|sites-rechecked)$/.test(path.dirname(file)))?'sitemap-completion':'sitemap-progress'):mode;
 await fs.writeFile(path.join(root,report+'-summary.json'),JSON.stringify(totals,null,2),{mode:0o600});
 console.log(JSON.stringify(totals));
}catch(error){
 console.error(JSON.stringify({error:error.code||error.displayName||error.name,status:error.statusCode||error.status,totals}));
 process.exitCode=1;
}finally{await missingOut?.close();await out?.close();if(state)state.close();else db?.close();es.close();}
