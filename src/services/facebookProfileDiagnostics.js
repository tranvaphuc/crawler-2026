import {createHash} from 'node:crypto';
import {snapshotPayloads} from './socialMetrics.js';
import {facebookAuthorRoute} from './facebookAuthorIdentity.js';
import {profileUidFromSnapshot} from './facebookFindUid.js';

// Whitelisted metadata only: no HTML, tokens, cookie, viewer ID or error text.
export function facebookProfileDiagnostics(snapshot,url,{elapsedMs=null}={}){
 const html=snapshot.html||'',roots=snapshotPayloads(html),routeNames=new Set();let initialRoute=null,limitEvidence=null;
 const walk=(v,path='',depth=0)=>{if(!v||typeof v!=='object'||depth>75)return;
  const name=v.canonicalRouteName||v.routeName;
  if(typeof name==='string'&&/^[A-Za-z0-9_.]{1,160}$/.test(name)){
   routeNames.add(name);if(path.endsWith('initialRouteInfo.route')){
    initialRoute=name;
    if(/ErrorRoute/.test(name)){
     const props=v.rootView?.props||{},title=typeof props.title==='string'?props.title:'',body=typeof props.body==='string'?props.body:'';
     if(/temporarily blocked|bị chặn tạm thời|tạm thời bị chặn/i.test(title)&&/going too fast|misusing this feature|quá nhanh/i.test(body))limitEvidence='TEMPORARY_FEATURE_BLOCK';
    }
   }
  }
  for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')walk(x,path+'.'+k,depth+1);
 };
 roots.forEach(v=>walk(v));
 const finalRoute=facebookAuthorRoute(snapshot.finalUrl||url),status=snapshot.httpStatus;
 const reason=status!==200?'FACEBOOK_PROFILE_HTTP_'+status:
  /LoginRoute|Checkpoint|Challenge/.test(initialRoute||'')||/\/(?:login|checkpoint|challenge)(?:[/?]|$)/.test(snapshot.finalUrl||'')?'FACEBOOK_PROFILE_LOGIN_OR_CHECKPOINT':
  /ErrorRoute/.test(initialRoute||'')?'FACEBOOK_PROFILE_ERROR_ROUTE':
  /Profile|Page/.test(initialRoute||'')?'FACEBOOK_PROFILE_ROUTE_UID_MISSING':
  initialRoute?'FACEBOOK_PROFILE_UNEXPECTED_ROUTE':!roots.length?'FACEBOOK_PROFILE_PAYLOAD_MISSING':'FACEBOOK_PROFILE_TARGET_ROUTE_MISSING';
 return{reason,httpStatus:status,elapsedMs,decodedBytes:Buffer.byteLength(html),responseSha256:createHash('sha256').update(html).digest('hex'),payloadCount:roots.length,initialRoute,routeNames:[...routeNames].slice(0,20),lookupRoute:facebookAuthorRoute(url),finalRoute,...(limitEvidence?{limitEvidence}:{})};
}

export async function readFacebookProfileWithProof({request,url,onFailure=async()=>{},onResult=async()=>{},maxAttempts=2}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>2)throw Error('FACEBOOK_PROFILE_ATTEMPT_LIMIT');
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const started=Date.now(),snapshot=await request(url),proof=profileUidFromSnapshot(snapshot,url);
  if(proof){await onResult({snapshot,proof,attempt});return{...proof,url,responseSha256:createHash('sha256').update(snapshot.html||'').digest('hex'),attempt};}
  const diagnostic=facebookProfileDiagnostics(snapshot,url,{elapsedMs:Date.now()-started});
  await onResult({snapshot,diagnostic,attempt});
  const retry=attempt<maxAttempts&&snapshot.httpStatus===200&&!/LOGIN_OR_CHECKPOINT/.test(diagnostic.reason);
  await onFailure({...diagnostic,attempt,retry});
  if(!retry)throw Object.assign(Error(diagnostic.reason),{code:diagnostic.reason,profileDiagnostics:diagnostic});
 }
 throw Error('FACEBOOK_PROFILE_ATTEMPT_LIMIT');
}
