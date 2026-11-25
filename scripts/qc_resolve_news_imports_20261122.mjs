// Resolve reviewed existing imports; only an independently confirmed wrong clock
// may receive a version-guarded date correction. Preserve every other ES field.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {gunzipSync,gzipSync} from 'node:zlib';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';
const base='/opt/news-flow/current',root='/var/lib/news-flow/qc-20261122',require=createRequire(base+'/package.json'),dotenv=require('dotenv'),ES=require('elasticsearch');
const {loadNewsRegistry}=await import('file://'+base+'/src/newsFlow/registry.mjs');
const {NewsHttpDriver,NewsProxyPool}=await import('file://'+base+'/src/newsFlow/transport.mjs');
const {createNewsResearchTransport}=await import('file://'+base+'/src/web/newsResearchTransport.mjs');
const {NewsRepairPool}=await import('file://'+base+'/src/web/newsRepairPool.mjs');
const {articleKey,toEs5News}=await import('file://'+base+'/src/newsFlow/identity.mjs');
const audit=JSON.parse(fs.readFileSync(root+'/news-audit.json')),registry=await loadNewsRegistry();
const db=new DatabaseSync('/var/lib/news-flow/news-flow-runtime/write.sqlite');db.exec('PRAGMA busy_timeout=20000');
const env=dotenv.parse(fs.readFileSync('/etc/news-flow/news.env')),es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',log:[],maxRetries:0,requestTimeout:30000});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pool=await NewsProxyPool.load('/etc/news-flow/proxies.json',{rotation:'request'}),driver=new NewsHttpDriver({state:{cacheResponses:false,failedUrl:()=>false,request:()=>null,reserve:()=>true,cache:()=>null,completeHttpResponse:()=>{}},pool,allowedDomains:registry.allowedDomains,profiles:JSON.parse(fs.readFileSync(base+'/config/web-sources/news-http-profiles.json')),siteCooldown:false});
const parsers=new NewsRepairPool(1,new URL('file://'+base+'/src/web/newsDeepAuditWorker.mjs'));
const result={at:new Date().toISOString(),resolved:[],held:[]},backup=[];
try{
 const cluster=await es.info(),proof=JSON.parse(fs.readFileSync('/etc/news-flow/identity-proof.json')).summary;if(!proof?.verified||!cluster.version.number.startsWith('5.6.')||createHash('sha256').update(cluster.cluster_uuid).digest('hex')!==proof.clusterFingerprint)throw Error('QC_CLUSTER_UNPROVEN');
 for(const entry of audit.news){
  const row=db.prepare("SELECT * FROM outbox WHERE id=? AND state='held'").get(entry.rowId);if(!row)continue;
  const doc=JSON.parse(row.doc),source=registry.byUrl(doc._source.url),hit=await es.get({index:doc._index,type:doc._type,id:doc._id});backup.push({row,es:hit});
 }
 fs.writeFileSync(root+'/news-import-resolution-backup.json',JSON.stringify(backup,null,2),{mode:0o600});
 for(const saved of backup){
  const {row,es:original}=saved,entry=audit.news.find(r=>r.rowId===row.id),doc=JSON.parse(row.doc),source=registry.byUrl(doc._source.url);
  try{
   if(!source||entry.writeError||!entry.doc||entry.issues?.length||articleKey(original._source.url)!==articleKey(doc._source.url)||articleKey(entry.doc._source.url)!==articleKey(doc._source.url)||entry.doc._index!==original._index)throw Error('QC_NEWS_IDENTITY_OR_PROOF_MISMATCH');
   const html=gunzipSync(fs.readFileSync(entry.evidence.file));if(createHash('sha256').update(html).digest('hex')!==entry.evidence.sha)throw Error('QC_NEWS_EVIDENCE_CHANGED');
   toEs5News({_source:entry.parsed.source,extracted:entry.parsed.extracted},source.config);
   const target=entry.doc._source.publishedDate,old=original._source.publishedDate,t=Date.parse(target),o=Date.parse(old);let action='existing_exact_native_clock',hit=original;
   if(t!==o){
    if(o%60000===0&&Math.floor(o/60000)===Math.floor(t/60000))action='existing_native_minute_precision';
    else{
     // A second independent public read must reproduce the owned original date.
     const transport=createNewsResearchTransport({...source.config,taskRole:'article',persistEvidence:false,baseTransport:driver.forCycle('qc-date-'+row.id,source.config,{reviewFailed:true,taskRole:'article'})});
     const page=await transport.get(doc._source.url,null,'confirm');if(page.error||!page.html)throw Error('QC_SECOND_READ_FAILED');
     const checked=await parsers.run({sample:{domain:source.domain,url:page.finalUrl||doc._source.url,html:page.html,kind:'article'},config:source.config,context:{},learn:false});
     if(checked.error||!checked.parsed||checked.quality?.length||checked.fields?.issues?.length||checked.policyConflict)throw Error('QC_SECOND_PARSER_UNVERIFIED');
     const verified=toEs5News(checked.parsed,source.config);if(verified._source.publishedDate!==target||articleKey(verified._source.url)!==articleKey(doc._source.url)||verified._index!==original._index)throw Error('QC_SECOND_CLOCK_CHANGED');
     const sha=createHash('sha256').update(page.html).digest('hex'),file=root+'/evidence/'+sha+'.html.gz';fs.writeFileSync(file,gzipSync(page.html));
     const current=await es.get({index:original._index,type:doc._type,id:original._id});if(current._version!==original._version||hash(current._source)!==hash(original._source))throw Error('QC_EXISTING_ES_CHANGED');
     await es.update({index:original._index,type:doc._type,id:original._id,version:original._version,refresh:true,body:{doc:{publishedDate:target}}});
     hit=await es.get({index:original._index,type:doc._type,id:original._id});if(hit._source.publishedDate!==target||hash({...hit._source,publishedDate:old})!==hash(original._source))throw Error('QC_DATE_CORRECTION_READBACK_FAILED');
     action='original_date_corrected_with_two_public_reads';
    }
   }
   const current=await es.get({index:hit._index,type:doc._type,id:hit._id});if(current._version!==hit._version||hash(current._source)!==hash(hit._source))throw Error('QC_EXISTING_ES_CHANGED');
   db.exec('BEGIN IMMEDIATE');try{
    const held=db.prepare("SELECT doc FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").get(row.id);if(held?.doc!==row.doc)throw Error('QC_OUTBOX_CHANGED');
    db.prepare('INSERT OR IGNORE INTO import_receipts VALUES(?,?,?,?,?,?,?)').run(row.id,hit._id,hit._index,doc._type,'existing',doc._source.url,Date.now());
    db.prepare("DELETE FROM outbox WHERE id=? AND state='held' AND reason='ES5_CREATE_UNCONFIRMED'").run(row.id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   result.resolved.push({id:row.id,url:doc._source.url,index:hit._index,action,oldESDate:old,verifiedNativeDate:target,finalESDate:hit._source.publishedDate,version:hit._version,sourceHash:hash(hit._source)});
  }catch(e){result.held.push({id:row.id,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.code||'QC_NEWS_RESOLUTION_FAILED'});}
  fs.writeFileSync(root+'/news-import-resolution.json',JSON.stringify(result,null,2));
 }
 result.finishedAt=new Date().toISOString();fs.writeFileSync(root+'/news-import-resolution.json',JSON.stringify(result,null,2));console.log(JSON.stringify({resolved:result.resolved.length,held:result.held,actions:result.resolved.map(r=>({url:r.url,action:r.action}))}));
}finally{db.close();es.close();await parsers.close();}
