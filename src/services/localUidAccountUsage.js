import fs from 'node:fs';
import path from 'node:path';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';

const labels=new Set(['Phúc 1','Phúc 2','Phúc 3','Lý Minh Trường']);
const purposes=new Set(['worker_lookup','header_validation','health_probe']);
const sources=new Set(['network','shared_request','memory_cache','mongo_cache']);
const safeInt=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const empty=at=>({trackingStartedAt:at,requestAttempts:0,httpRequestsConfirmed:0,httpRequestsUncertain:0,responses:0,transportErrors:0,inFlight:0,nativeUidProofs:0,uniqueNativeUids:0,resolvedJobs:0,cacheJobs:0,sharedRequestJobs:0,byPurpose:{},limitSignals:0,featureBlockSignals:0,firstLimitObserved:null,firstFeatureBlockObserved:null,lastLimitObserved:null,lastNativeUidAt:null});

// Local append-only journal is authoritative. Each write is a single O_APPEND
// operation; probes and the worker can append without racing counter snapshots.
// Reports replay request IDs, so restarts do not reset counts or double-count UIDs.
export function createLocalUidAccountUsage({dir,now=()=>new Date().toISOString()}={}){
 fs.mkdirSync(dir,{recursive:true});
 const journal=path.join(dir,'uid-account-usage.events.jsonl'),saltFile=path.join(dir,'uid-account-usage.salt.credentials.json');
 let salt;
 try{salt=JSON.parse(fs.readFileSync(saltFile,'utf8')).salt;}catch(e){if(e.code!=='ENOENT')throw e;const temp=saltFile+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify({salt:randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'});try{fs.linkSync(temp,saltFile);}catch(x){if(x.code!=='EEXIST')throw x;}}finally{fs.rmSync(temp,{force:true});}salt=JSON.parse(fs.readFileSync(saltFile,'utf8')).salt;}
 if(!/^[a-f0-9]{64}$/.test(salt||''))throw Error('UID_USAGE_SALT_INVALID');
 fs.chmodSync(saltFile,0o600);
 const digest=s=>createHmac('sha256',salt).update(s).digest('hex');
 const append=row=>{fs.appendFileSync(journal,JSON.stringify({version:1,at:now(),...row})+'\n',{mode:0o600});fs.chmodSync(journal,0o600);return row;};
 const accounts=new Map(),sessions=new Map(),requests=new Map(),seenProofs=new Set(),seenJobs=new Set(),seenLimits=new Set(),unique=new Map(),recent=new Map();let offset=0;
 const state=(map,key,at)=>{if(!map.has(key))map.set(key,empty(at));return map.get(key);};
 function apply(e){
  if(!e.accountKey||!e.sessionKey)return;
  const a=state(accounts,e.accountKey,e.at),s=state(sessions,e.sessionKey,e.at);s.accountKey=e.accountKey;
  if(e.event==='account_label'){if(labels.has(e.profileLabel))a.profileLabel=e.profileLabel;return;}
  const rows=[a,s];
  if(e.event==='request_started'){
   if(requests.has(e.requestId))return;
   requests.set(e.requestId,{...e,accountOrdinal:a.requestAttempts+1,sessionOrdinal:s.requestAttempts+1,finished:false});
   const times=recent.get(e.accountKey)||[];times.push(Date.parse(e.at));recent.set(e.accountKey,times.filter(t=>t>=Date.parse(e.at)-300000));
   for(const x of rows){x.requestAttempts++;x.inFlight++;x.byPurpose[e.purpose]=(x.byPurpose[e.purpose]||0)+1;}return;
  }
  const request=requests.get(e.requestId);
  if(e.event==='request_finished'){
   if(!request||request.finished)return;request.finished=true;
   for(const x of rows){x.inFlight=Math.max(0,x.inFlight-1);x.httpRequestsConfirmed+=safeInt(e.httpRequestsConfirmed);x.httpRequestsUncertain+=safeInt(e.httpRequestsUncertain);if(e.httpStatus>0)x.responses++;if(e.curlExit!==0)x.transportErrors++;}return;
  }
  if(e.event==='native_uid_proven'){
   if(!request||seenProofs.has(e.requestId))return;seenProofs.add(e.requestId);
   for(const [key,x]of [[e.accountKey,a],[e.sessionKey,s]]){const set=unique.get(key)||new Set();set.add(e.uidHash);unique.set(key,set);x.nativeUidProofs++;x.uniqueNativeUids=set.size;x.lastNativeUidAt=e.at;}return;
  }
  if(e.event==='job_resolved'){
   if(seenJobs.has(e.jobKey))return;seenJobs.add(e.jobKey);
   for(const x of rows){x.resolvedJobs++;if(['memory_cache','mongo_cache'].includes(e.source))x.cacheJobs++;if(e.source==='shared_request')x.sharedRequestJobs++;}return;
  }
  if(e.event==='limit_observed'&&request){
   const id=e.requestId+':'+e.evidence;if(seenLimits.has(id))return;seenLimits.add(id);
   const snapshot=x=>({observedAt:e.at,requestStartedAt:request.at,requestId:e.requestId,purpose:request.purpose,concurrency:request.concurrency,evidence:e.evidence,httpStatus:e.httpStatus,requestAttempts:x.requestAttempts,httpRequestsConfirmed:x.httpRequestsConfirmed,httpRequestsUncertain:x.httpRequestsUncertain,nativeUidProofs:x.nativeUidProofs,uniqueNativeUids:x.uniqueNativeUids,inFlight:x.inFlight,lastNativeUidAt:x.lastNativeUidAt});
   const times=recent.get(e.accountKey)||[],at=Date.parse(e.at);
   const rate={requestStartsLast60s:times.filter(t=>t>=at-60000&&t<=at).length,requestStartsLast300s:times.filter(t=>t>=at-300000&&t<=at).length};
   for(const [x,ordinal]of [[a,request.accountOrdinal],[s,request.sessionOrdinal]]){const point={...snapshot(x),requestOrdinal:ordinal,...rate};x.limitSignals++;x.lastLimitObserved=point;x.firstLimitObserved ||=point;if(e.evidence==='TEMPORARY_FEATURE_BLOCK'){x.featureBlockSignals++;x.firstFeatureBlockObserved ||=point;}}
  }
 }
 function sync(){
  if(!fs.existsSync(journal))return;
  const size=fs.statSync(journal).size;if(size<offset)throw Error('UID_USAGE_JOURNAL_TRUNCATED');if(size===offset)return;
  const fd=fs.openSync(journal,'r'),buffer=Buffer.alloc(size-offset);try{fs.readSync(fd,buffer,0,buffer.length,offset);}finally{fs.closeSync(fd);}
  const end=buffer.lastIndexOf(10);if(end<0)return;
  for(const line of buffer.subarray(0,end).toString('utf8').split('\n')){if(line)apply(JSON.parse(line));}offset+=end+1;
 }
 function context(config){
  let cookie='';for(const line of config.split('\n')){const m=line.match(/^\s*header\s*=\s*(".*")\s*$/);if(m){const value=JSON.parse(m[1]);if(/^cookie:/i.test(value))cookie=value.slice(value.indexOf(':')+1).trim();}}
  const account=cookie.match(/(?:^|;)\s*c_user=(\d+)(?:;|$)/)?.[1];if(!account)throw Error('UID_USAGE_AUTH_ACCOUNT_REQUIRED');
  return{accountKey:'account_'+digest('account:'+account).slice(0,24),sessionKey:'session_'+digest('config:'+config).slice(0,24)};
 }
 function observe(snapshot,{proof,diagnostic}={}){
  const ref=snapshot.uidUsageRef;if(!ref)return;
  if(proof?.id)append({...ref,event:'native_uid_proven',uidHash:digest('uid:'+proof.id)});
  const evidence=snapshot.httpStatus===429?'HTTP_429':diagnostic?.limitEvidence;
  if(['HTTP_429','TEMPORARY_FEATURE_BLOCK'].includes(evidence))append({...ref,event:'limit_observed',evidence,httpStatus:snapshot.httpStatus});
 }
 return{
  journal,context,
  register(config,profileLabel){if(!labels.has(profileLabel))throw Error('UID_USAGE_PROFILE_LABEL_INVALID');const ref=context(config);append({...ref,event:'account_label',profileLabel});return ref;},
  start(config,{purpose='worker_lookup',target,concurrency}={}){if(!purposes.has(purpose))throw Error('UID_USAGE_PURPOSE_INVALID');const ref={...context(config),requestId:randomUUID()};append({...ref,event:'request_started',purpose,targetHash:digest('target:'+target),...(Number.isInteger(concurrency)?{concurrency}:{})});return ref;},
  finish(ref,{httpStatus=0,numRedirects=0,sizeRequest=0,curlExit=null,durationMs=0,accountingAvailable=true,noRequestPossible=false}={}){
   const n=safeInt(numRedirects),complete=curlExit===0&&httpStatus>0||httpStatus>=100&&(httpStatus<300||httpStatus>=400),confirmed=complete?n+1:n,uncertain=noRequestPossible?0:!accountingAvailable?1:complete?0:sizeRequest>0||n>0?1:0;
   append({...ref,event:'request_finished',httpStatus:safeInt(httpStatus),numRedirects:n,curlExit:Number.isInteger(curlExit)?curlExit:null,durationMs:safeInt(durationMs),httpRequestsConfirmed:confirmed,httpRequestsUncertain:uncertain});
  },
  observe,
  jobResolved(ref,{jobId,source}={}){if(!sources.has(source))throw Error('UID_USAGE_SOURCE_INVALID');append({accountKey:ref.accountKey,sessionKey:ref.sessionKey,event:'job_resolved',jobKey:digest('job:'+jobId),source});},
  report(){sync();return{version:1,generatedAt:now(),scope:'local_worker_and_instrumented_probes_only',historyBeforeTracking:'not_backfilled',uncertainCountMeaning:'transfers_with_unconfirmed_request_or_missing_curl_accounting_not_an_exact_http_upper_bound',accounts:[...accounts].map(([accountKey,x])=>({accountKey,profileLabel:x.profileLabel||'unlabelled',...x})),sessions:[...sessions].map(([sessionKey,x])=>({sessionKey,...x}))};},
  saveSummary(){const report=this.report(),p=path.join(dir,'uid-account-usage.summary.json'),tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(report,null,2)+'\n',{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,p);return report;}
 };
}
