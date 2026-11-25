import fs from 'node:fs/promises';import {MongoClient} from 'mongodb';
import {createSocialApiRuntime} from '../src/services/socialApiRuntime.js';import {createProxyManagerClient} from '../src/services/proxyManagerClient.js';
import {prepareCrawlSourceInput,sourceIdentityChanged,exactPostCommentCount,commentCountDecision} from '../src/services/crawlerV8Policy.js';
import {serializeCrawlItem} from '../src/services/crawlerV8Es5.js';import {normalizeContentInput} from '../src/services/socialContent.js';
import {READ_STATE} from '../src/services/socialReadState.js';import {disposeReadState} from '../src/services/socialLeaseState.js';
const c=new MongoClient(process.env.CRAWL_MONGO_URI);await c.connect();
try{
 const db=c.db(),runtime=createSocialApiRuntime({getProxy:createProxyManagerClient(),maxPages:1,timeoutMs:45000}),run=await db.collection('runs').findOne({_id:process.env.CRAWL_RUN_ID||'october-2026-v8'});
 const rows=[...await db.collection('sources').find({platform:'facebook',type:'page',eligible:true}).limit(3).toArray(),...await db.collection('sources').find({platform:'facebook',type:'user',eligible:true}).limit(9).toArray()];
 const results=[];let next=0;
 async function worker(){while(next<rows.length){const s=rows[next++];let result;const report={source:s._id,listedType:s.type,listedId:s.nativeId,feedRequested:false};
  try{const body=await prepareCrawlSourceInput(runtime,s,{limit:2,count:2});const r=body.reference;Object.assign(report,{identityVerified:true,actualType:r.type,actualId:r.id,profileId:r.profileId||null,evidence:r.evidence,reclassified:sourceIdentityChanged(s,body)});
   const canonical={...s,type:r.type,nativeId:r.id,name:r.name||s.name};report.feedRequested=true;result=await runtime.readContent(normalizeContentInput('source',body));Object.assign(report,{status:result.status,reason:result.reason,count:result.items?.length||0,valid:[],rejected:[]});
   for(const item of result.items||[])try{const d=serializeCrawlItem(item,canonical,{since:run.since,until:new Date().toISOString()});report.valid.push({id:d._id,type:d._type,date:d._source.publishedDate,commentCount:exactPostCommentCount(item),commentDecision:commentCountDecision(exactPostCommentCount(item))});}catch(e){report.rejected.push(e.code||'VALIDATION_FAILED');}
  }catch(e){report.error=/^[A-Z0-9_]+$/.test(e.code||e.message||'')?(e.code||e.message):e.name;}finally{await disposeReadState(result?.[READ_STATE]).catch(()=>{});results.push(report);console.log(JSON.stringify(report));}
 }}
 await Promise.all(Array.from({length:4},worker));
 const report={at:new Date().toISOString(),results,identityVerified:results.filter(x=>x.identityVerified).length,validDocuments:results.reduce((n,x)=>n+(x.valid?.length||0),0),unverifiedNeverFetched:results.filter(x=>!x.identityVerified).every(x=>!x.feedRequested),sharedProxyManager:true};
 await fs.writeFile((process.env.CRAWL_DATA_DIR||'/var/lib/crawler-v8')+'/policy-v2-smoke.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({identityVerified:report.identityVerified,validDocuments:report.validDocuments,unverifiedNeverFetched:report.unverifiedNeverFetched}));
}finally{await c.close();}
