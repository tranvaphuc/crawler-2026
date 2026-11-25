import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';
import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
import {ThreeFlowProcessor} from '../src/newsFlow/threeFlowProcessor.mjs';
import {NewsHttpDriver,NewsProxyPool} from '../src/newsFlow/transport.mjs';
import {NewsNetworkPool} from '../src/newsFlow/networkPool.mjs';
import {NewsRepairPool} from '../src/web/newsRepairPool.mjs';
import {requestKey} from '../src/newsFlow/identity.mjs';

const filename=process.argv[2];
const all=process.argv.includes('--all');
const siteFilter=process.argv.find(arg=>arg.startsWith('--site='))?.slice(7)??null;
if(!filename)throw Error('Output file required');
const live=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite',{readOnly:true});
const reasons=['request_deadline_exceeded','public_api_request_deadline_exceeded','NEWS_PUBLICATION_EVIDENCE_CONFLICT','NEWS_INVALID_PUBLICATION_TIME'];
if(process.argv.includes('--ownership'))reasons.push('NEWS_PUBLICATION_OWNERSHIP_UNCONFIRMED','NEWS_PUBLICATION_METADATA_UNCORROBORATED');
const jobs=live.prepare(`
 WITH recent AS (
  SELECT site,url,error,first_at,row_number() OVER (PARTITION BY site,error ORDER BY first_at DESC) priority
  FROM article_links WHERE parse_status='fail' AND first_at>=? AND error IN (SELECT value FROM json_each(?)) AND (? IS NULL OR site=?)
 )
 SELECT site,url,error,first_at FROM recent WHERE (? OR priority<=2) ORDER BY priority,first_at DESC
`).all(Date.now()-86400000,JSON.stringify(reasons),siteFilter,siteFilter,Number(all));
const state=await ThreeFlowState.open(':memory:');
for(const row of live.prepare('SELECT * FROM parser_overlays').all())state.db.prepare('INSERT INTO parser_overlays VALUES(?,?,?,?)').run(row.site,row.config,row.revision,row.verified_at);
live.close();
const registry=await loadNewsRegistry();
state.loadOverlays(registry);
const profiles=JSON.parse(await fs.readFile('config/web-sources/news-http-profiles.json','utf8'));
const network=new NewsNetworkPool({workers:2});
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'});
const parsers=new NewsRepairPool(2,new URL('../src/web/newsDeepAuditWorker.mjs',import.meta.url));
const driver=new NewsHttpDriver({state,network,pool,profiles,allowedDomains:registry.allowedDomains,siteCooldown:false,timeoutMs:5000,retryArticleTimeout:all});
const documents=new Map(), results=[], output=await fs.open(filename,'a',0o600);
const processor=new ThreeFlowProcessor({state,driver,registry,parsers,maxAgeHours:Infinity,expand:true,admitRelated:false,onArticle:({doc,parsed,metric})=>documents.set(metric.cycle,{proof:parsed.extracted.publicationProof,publishedDate:doc._source.publishedDate,index:doc._index,id:doc._id})});
const createTransport=processor.transport.bind(processor), feedPages=new Map();
processor.transport=(task,source)=>{
 const transport=createTransport(task,source);
 return {...transport,get:async(...args)=>{
  if(args[2]!=='publication-feed')return transport.get(...args);
  const url=args[0];
  if(!feedPages.has(url))feedPages.set(url,transport.get(...args));
  try{
   const page=await feedPages.get(url);
   if(page.error||!page.html)feedPages.delete(url);
   return page;
  }catch(error){feedPages.delete(url);throw error;}
 }};
};
const processed=new Set((await fs.readFile(filename,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line).url));
let cursor=0;
async function review(job){
 if(!registry.sources.has(job.site)||processed.has(job.url))return;
 const cycle='coverage-review-'+requestKey(job.url);
 state.cycle(cycle);
 const id=state.db.prepare("INSERT INTO tasks(cycle,url,url_key,site,role,priority,state,reason,created) values(?,?,?,?,'article',100,'running','manual_refresh',?)").run(cycle,job.url,requestKey(job.url),job.site,Date.now()).lastInsertRowid;
 const task=state.db.prepare('select * from tasks where id=?').get(id);
 try{await processor.process(task);}catch(e){await processor.hold(task,e.code||e.name);}
 const terminal=state.db.prepare('select state,reason from tasks where id=?').get(id);
 const row={...job,...terminal,verified:documents.get(cycle)||null};
 documents.delete(cycle);
 results.push(row);
 await output.appendFile(JSON.stringify(row)+'\n');
 if(results.length%25===0)console.log(JSON.stringify({total:jobs.length,done:results.length,verified:results.filter(r=>r.verified).length}));
}
console.log(JSON.stringify({total:jobs.length,paidAiCalls:0}));
try{
 await Promise.all(Array.from({length:12},async()=>{while(cursor<jobs.length)await review(jobs[cursor++]);}));
 console.log(JSON.stringify({total:jobs.length,done:results.length,verified:results.filter(r=>r.verified).length}));
}finally{await output.close();await parsers.close();await network.close();state.close();}
