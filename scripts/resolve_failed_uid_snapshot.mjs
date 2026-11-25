import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {readFacebookProfileWithProof} from '../src/services/facebookProfileDiagnostics.js';
import {MongoClient} from 'mongodb';
import {createFacebookLocalUidRoutes} from '../src/services/facebookLocalUidRoutes.js';
import {facebookAuthorRoute} from '../src/services/facebookAuthorIdentity.js';
import {uidLookupUrl} from '../src/services/facebookFindUid.js';
import {facebookAuthorProfileKey} from '../src/services/facebookAuthorIdentity.js';
import {authorLookupKeys,createMongoAuthorStore} from '../src/services/facebookAuthorResolution.js';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';
import {trackedUidRequest} from '../src/services/localUidTrackedRequest.js';

const dir=path.resolve(process.env.LOCAL_UID_DIR||'outputs/local-uid-worker-2026-10-29');
const retryUnresolved=process.argv.includes('--retry-unresolved'),alternateRoute=process.argv.includes('--alternate-route'),direct=process.argv.includes('--direct');
const op=JSON.parse(fs.readFileSync(process.argv.slice(2).find(x=>!x.startsWith('--'))||path.join(dir,'latest-failed-retry.json')));
const manifest=JSON.parse(fs.readFileSync(op.manifest));
if(manifest.browserProfile!=='Phúc 3')throw Error('PHUC3_SNAPSHOT_REQUIRED');
const tickets=JSON.parse(fs.readFileSync(op.root+'/tickets.credentials.json'));
const config=op.root+'/phuc3-current.credentials.conf';
if(!fs.existsSync(config)){fs.copyFileSync(dir+'/curl.credentials.conf',config);fs.chmodSync(config,0o600);}
const usage=createLocalUidAccountUsage({dir}),context=usage.context(fs.readFileSync(config,'utf8'));
const actorId=fs.readFileSync(config,'utf8').match(/c_user=(\d+)/)?.[1];
const routeLookup=createFacebookLocalUidRoutes({expectedActorId:actorId,request:(url,options={})=>trackedUidRequest({dir,configFile:config,url,...options,usage,purpose:'worker_lookup',concurrency:3})});
const groups=new Map();
for(const ticket of tickets){
 const item=ticket.data.item,url=uidLookupUrl(item),key=url&&(facebookAuthorProfileKey(url)||url);
 if(!groups.has(key))groups.set(key,{key,url,jobIds:[],keys:new Set()});
 const group=groups.get(key);group.jobIds.push(ticket.id);
 for(const k of authorLookupKeys({authorOpaqueId:item?.author?.opaqueId,authorUrl:item?.author?.profileUrl}))group.keys.add(k);
 if(key)group.keys.add(key);
}
async function lookupRoutes(urls){
 for(let attempt=0;!direct&&attempt<3;attempt++){
  try{return await routeLookup(urls);}catch(error){
   if(error.code!=='FACEBOOK_SERVER_ERROR')throw error;
   if(attempt<2)await sleep(attempt===0?3000:10000);
  }
 }
 const proofs=new Map(),missing=new Map();
 for(const url of urls){
  try{
   const proof=await readFacebookProfileWithProof({url,maxAttempts:2,request:target=>trackedUidRequest({dir,configFile:config,url:target,usage,purpose:'worker_lookup',concurrency:3}),onResult:async result=>usage.observe(result.snapshot,result)});
   proofs.set(facebookAuthorRoute(url),proof);
  }catch(error){
   const reason=error.profileDiagnostics?.reason||error.code||error.message;
   if(/LOGIN_OR_CHECKPOINT|HTTP_429|AUTH_REQUIRED|SECURITY_CHECKPOINT|RATE_LIMITED/.test(reason)||error.profileDiagnostics?.limitEvidence)throw error;
   missing.set(facebookAuthorRoute(url),{reason});
  }
 }
 return{proofs,missing};
}
const profileFile=op.root+'/profile-results.jsonl',done=new Map();
if(fs.existsSync(profileFile))for(const line of fs.readFileSync(profileFile,'utf8').trim().split('\n').filter(Boolean)){const row=JSON.parse(line);if(row.uid||row.sessionKey===context.sessionKey)done.set(row.key,row);}
for(const [key,row] of done)if(groups.has(key))row.jobIds=[...groups.get(key).jobIds];
const credentials=JSON.parse(fs.readFileSync(dir+'/local-connection.credentials.json'));
const mongo=new MongoClient(credentials.mongo,{serverSelectionTimeoutMS:15000,socketTimeoutMS:45000,maxPoolSize:2});
await mongo.connect();
const collection=mongo.db().collection('flow_author_identities'),store=createMongoAuthorStore(collection);
const facts=new Map(),allKeys=[...new Set([...groups.values()].filter(g=>!done.get(g.key)?.uid).flatMap(g=>[...g.keys]))];
let cacheOffset=0;
await Promise.all(Array.from({length:2},async()=>{while(cacheOffset<allKeys.length){const i=cacheOffset;cacheOffset+=1000;for(const fact of await store.getMany(allKeys.slice(i,i+1000)))facts.set(fact._id,fact);}}));
let blocked=null,stopping=false,finished=false,next=0,cacheWrites=0,pendingFacts=[];
const work=[...groups.values()].filter(g=>!done.has(g.key)||(retryUnresolved&&!done.get(g.key)?.uid)).sort((a,b)=>b.jobIds.length-a.jobIds.length);
let flushChain=Promise.resolve();
function flush(){const batch=pendingFacts.splice(0);if(!batch.length)return flushChain;flushChain=flushChain.then(async()=>{await store.putMany(batch);cacheWrites+=batch.length;});return flushChain;}
function save(){
 const rows=[...done.values()],resolved=rows.filter(r=>r.uid),failed=rows.filter(r=>!r.uid),reasons={};
 for(const row of failed)reasons[row.reason]=(reasons[row.reason]||0)+row.jobIds.length;
 const report={at:new Date().toISOString(),operationId:op.operationId,browserProfile:'Phúc 3',snapshot:manifest.count,profiles:groups.size,checkedProfiles:done.size,resolvedProfiles:resolved.length,resolvedJobs:resolved.reduce((s,r)=>s+r.jobIds.length,0),mongoCacheProfiles:resolved.filter(r=>r.source==='mongo_cache').length,networkProfiles:resolved.filter(r=>r.source==='network').length,cacheWrites,failedJobs:failed.reduce((s,r)=>s+r.jobIds.length,0),pendingProfiles:groups.size-done.size,blocked,status:blocked?'blocked':stopping?'stopped':finished?'complete':'running',retryUnresolved,alternateRoute,direct,reasons};
 const target=op.root+'/uid-resolution-progress.json';fs.writeFileSync(target+'.tmp',JSON.stringify(report,null,2),{mode:0o600});fs.renameSync(target+'.tmp',target);return report;
}
function csv(){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';const rows=['jobId,profileUrl,uid,status,source,reason'];for(const group of groups.values()){const row=done.get(group.key);for(const id of group.jobIds)rows.push([id,group.url,row?.uid,row?.uid?'resolved':row?'failed':'pending',row?.source,row?.reason||(!row?blocked||'PENDING':'')].map(quote).join(','));}fs.writeFileSync(op.root+'/job-uids.csv',rows.join('\n')+'\n',{mode:0o600});}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;});
console.log(JSON.stringify({phase:'start',...save()}));
const timer=setInterval(()=>{console.log(JSON.stringify(save()));void flush().catch(()=>{blocked='MONGO_CACHE_WRITE_FAILED';});},15000);
try{
 await Promise.all(Array.from({length:3},async()=>{while(next<work.length&&!blocked&&!stopping){
  const batch=work.slice(next,next+10);next+=batch.length;
  const network=[];
  const record=row=>{fs.appendFileSync(profileFile,JSON.stringify(row)+'\n',{mode:0o600});done.set(row.key,row);};
  for(const group of batch){
   const row={key:group.key,url:group.url,jobIds:group.jobIds,at:new Date().toISOString(),uid:null,...context};
   const hits=[...group.keys].map(k=>facts.get(k)).filter(Boolean),ids=new Set(hits.filter(f=>/^[1-9]\d*$/.test(f.id||'')).map(f=>f.id));
   if(ids.size>1){record({...row,reason:'FACEBOOK_PROFILE_UID_CONFLICT'});continue;}
   if(ids.size===1){const hit=hits.find(f=>ids.has(f.id));record({...row,uid:hit.id,evidence:hit.evidence,source:'mongo_cache'});continue;}
   if(!group.url){record({...row,reason:'FACEBOOK_AUTHOR_PROFILE_URL_REQUIRED'});continue;}
   const opaque=/^https:\/\/www\.facebook\.com\/(pfbid[A-Za-z0-9]+)$/.exec(group.url)?.[1];
   const requestUrl=alternateRoute&&opaque?'https://www.facebook.com/profile.php?id='+opaque:group.url;
   network.push({group,row:{...row,...(requestUrl!==group.url?{lookupUrl:requestUrl}:{})},requestUrl});
  }
  if(!network.length)continue;
  let result;
  try{result=await lookupRoutes(network.map(x=>x.requestUrl));}
  catch(error){blocked=error.code||error.message;fs.appendFileSync(op.root+'/run-events.jsonl',JSON.stringify({at:new Date(),event:'batch_blocked',reason:blocked,profiles:network.length})+'\n',{mode:0o600});continue;}
  for(const {group,row,requestUrl} of network){
   const route=facebookAuthorRoute(requestUrl),proof=result.proofs.get(route);
   if(proof){
    record({...row,uid:proof.id,evidence:proof.evidence,responseSha256:proof.responseSha256,source:'network',method:direct?'profile_get':'bulk_route'});
    pendingFacts.push({id:proof.id,evidence:proof.evidence,keys:[...group.keys]});
   }else record({...row,reason:result.missing.get(route)?.reason||'FACEBOOK_PROFILE_UID_NOT_RETURNED',responseSha256:result.missing.get(route)?.responseSha256,method:direct?'profile_get':'bulk_route'});
  }
  if(pendingFacts.length>=50)await flush();
 }}));
 await flush();
}finally{clearInterval(timer);await flush().catch(()=>{blocked='MONGO_CACHE_WRITE_FAILED';});finished=true;csv();console.log(JSON.stringify({phase:'finished',...save()}));usage.saveSummary();await mongo.close();}
