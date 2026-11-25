import fs from 'node:fs';
import {createFacebookLocalUidRoutes} from '../src/services/facebookLocalUidRoutes.js';
import {createLocalUidAccountUsage} from '../src/services/localUidAccountUsage.js';
import {facebookAuthorRoute} from '../src/services/facebookAuthorIdentity.js';
import {fetchTextWithDeadline} from './nguoinoitieng_http.mjs';

const dir='outputs/local-uid-worker-2026-10-29',out='outputs/nguoinoitieng-2026-11-18/platform-ids-2026-11-25';
const config=fs.readFileSync(dir+'/curl.credentials.conf','utf8'),headers={};
for(const line of config.split('\n')){const m=line.match(/^\s*header\s*=\s*(".*")\s*$/);if(m){const v=JSON.parse(m[1]),i=v.indexOf(':');if(i>0&&['cookie','user-agent','accept-language'].includes(v.slice(0,i).toLowerCase()))headers[v.slice(0,i).toLowerCase()]=v.slice(i+1).trim();}}
headers['user-agent']='Mozilla/5.0';
const actor=headers.cookie?.match(/(?:^|;)\s*c_user=(\d+)/)?.[1];if(!actor)throw Error('EXISTING_LOCAL_UID_ACCOUNT_REQUIRED');
const usage=createLocalUidAccountUsage({dir});
async function request(url,{routeForm}={}){
 const ref=usage.start(config,{target:url,purpose:'worker_lookup',concurrency:1});let httpStatus=0,redirects=0,exit=1;
 try{
  let target=url;
  for(let hop=0;hop<6;hop++){
   const u=new URL(target);if(u.protocol!=='https:'||u.hostname!=='www.facebook.com')throw Error('FACEBOOK_REDIRECT_REQUIRES_REVIEW');
   const {response,body}=await fetchTextWithDeadline(target,{method:routeForm?'POST':'GET',headers:{...headers,...(routeForm?{'content-type':'application/x-www-form-urlencoded',origin:'https://www.facebook.com',referer:'https://www.facebook.com/'}:{})},...(routeForm?{body:new URLSearchParams(routeForm)}:{}),redirect:'manual',timeoutMs:25000});
   httpStatus=response.status;
   if([301,302,303,307,308].includes(httpStatus)){target=new URL(response.headers.get('location'),target).href;routeForm=null;redirects++;continue;}
   exit=0;const snap={httpStatus,html:body,finalUrl:target,uidUsageRef:ref};usage.observe(snap);return snap;
  }
  throw Error('FACEBOOK_REDIRECT_LIMIT');
 }finally{usage.finish(ref,{httpStatus,numRedirects:redirects,curlExit:exit,durationMs:0,accountingAvailable:true,sizeRequest:1});}
}
const lookup=createFacebookLocalUidRoutes({request,expectedActorId:actor});
const latest=new Map(fs.readFileSync(out+'/resolution-journal.jsonl','utf8').trim().split('\n').map(JSON.parse).map(r=>[r.key,r]));
const accounts=JSON.parse(fs.readFileSync(out+'/manifest.json','utf8')).accounts;
const work=accounts.filter(a=>a.platform==='facebook'&&!a.invalid&&latest.get(a.key)?.status==='unresolved'&&latest.get(a.key)?.reason==='FACEBOOK_PROFILE_NOT_PUBLIC');
if(process.argv.includes('--probe'))work.splice(10);
let checked=0,resolved=0,blocked=null;
try{
 for(let i=0;i<work.length;i+=10){
  const batch=work.slice(i,i+10),r=await lookup(batch.map(a=>a.url));
  for(const a of batch){const route=facebookAuthorRoute(a.url),proof=r.proofs.get(route),previous=latest.get(a.key);checked++;
   if(proof){const row={key:a.key,status:'resolved',id:proof.id,profile_id:proof.id,id_type:'profile_id',page_id:null,evidence:proof.evidence,response_sha256:proof.responseSha256,method:'existing_local_uid_session_bulk_route',live_checked:true,checked_at:new Date().toISOString()};fs.appendFileSync(out+'/resolution-journal.jsonl',JSON.stringify(row)+'\n');resolved++;}
   else fs.appendFileSync(out+'/recovery-unresolved.jsonl',JSON.stringify({key:a.key,reason:r.missing.get(route)?.reason||'NO_UID_PROOF',previous_reason:previous?.reason,checked_at:new Date().toISOString()})+'\n');
  }
  if(checked%100===0)console.log(JSON.stringify({checked,resolved,total:work.length}));
  await new Promise(r=>setTimeout(r,700));
 }
}catch(e){blocked=e.code||(/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name);}
const report={at:new Date().toISOString(),checked,resolved,total:work.length,blocked};
fs.writeFileSync(out+'/recovery-status.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
