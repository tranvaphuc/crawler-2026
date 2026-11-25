import {verifySystemIdentity} from './socialIdentityGuard.js';
import {createConfiguredProxyProvider} from './socialProxyConfig.js';
import {createSocialHttpContentReader,createSocialHttpMetricsReader} from './socialHttpReaders.js';
import {createFacebookContentHttpReader} from './facebookContentHttp.js';
import {createSocialInfoReaders} from './socialInfo.js';
import {createEs5ReferenceLookup,createSystemInputAdapter,ReferenceError} from './socialSystemReference.js';
import {normalizeMetricsInput,metricsFromVerifiedFacebookPost} from './socialMetrics.js';
export function createSocialApiRuntime(options={}){
 const getProxy=options.getProxy||createConfiguredProxyProvider(),shared={...options,getProxy},info=createSocialInfoReaders(shared),lookup=options.lookup||createEs5ReferenceLookup();
 const rawPostInfo=info.postInfo;info.postInfo=async t=>verifySystemIdentity(t,await rawPostInfo(t));
 const cache=new Map();const sourceInfo=async ref=>{const key=ref.platform+'|'+(ref.url||ref.seedPostUrl)+'|'+ref.id,cached=cache.get(key);if(cached&&cached.until>Date.now())return cached.value;const value=await info.sourceInfo(ref);if(value.idVerified){while(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(key,{value,until:Date.now()+300000});}return value;};
 const basePrepare=createSystemInputAdapter({lookup,resolveSource:sourceInfo});
 const prepareInput=async(body,operation)=>{
  let prepared=await basePrepare(body,operation);
  if(operation==='comments'&&(prepared.url||prepared.link)){
   let target;try{target=normalizeMetricsInput(prepared);}catch{return prepared;}
   if(target.platform==='facebook'&&!target.facebook.postId){const r=await info.postInfo(target);if(!r.post?.id||!r.identityVerified)throw new ReferenceError(r.reason||'POST_ID_UNVERIFIED',['rate_limited','auth_required','security_checkpoint','proxy_error','error'].includes(r.status)?200:422,{resultStatus:r.status,retryAfterMs:r.retryAfterMs});prepared={...prepared,url:r.post.url||`https://www.facebook.com/${r.post.id}`};if(prepared.link)prepared.link=prepared.url;}
  }
  return prepared;
 };
 const social=createSocialHttpContentReader(shared),facebook=createFacebookContentHttpReader(shared);
 const metrics=createSocialHttpMetricsReader(shared);return{getProxy,lookup,prepareInput,info,readContent:async t=>verifySystemIdentity(t,await(t.platform==='facebook'?facebook(t):social(t))),readMetrics:async t=>{
  let r=await metrics(t);
  if(t.platform==='facebook'&&r.status==='unavailable'&&['PUBLIC_COUNTERS_NOT_RETURNED','POST_ID_UNVERIFIED','ANONYMOUS_POST_DATA_NOT_RETURNED','POST_IDENTITY_MISMATCH'].includes(r.reason)&&!r.identityVerified&&t.facebook.ownerId&&t.facebook.postId){
   const url='https://www.facebook.com/permalink.php?'+new URLSearchParams({story_fbid:t.facebook.postId,id:t.facebook.ownerId});
   if(t.url!==url){
    const fallback=await info.postInfo({...t,url,facebook:{...t.facebook,url,inputUrl:url},apiOperation:'metrics'}),transport={...fallback.transport,requests:(r.transport?.requests||0)+(fallback.transport?.requests||0),identityFallback:'facebook_numeric_permalink'};
    if(fallback.identityVerified&&fallback.post?.postId===t.facebook.postId&&[fallback.post.ownerId,fallback.post.profileId,fallback.post.pageId].includes(t.facebook.ownerId))r={...metricsFromVerifiedFacebookPost(t,fallback.post),transport};
    else if(['rate_limited','auth_required','security_checkpoint','proxy_error','error'].includes(fallback.status))r={...r,status:fallback.status,reason:fallback.reason,retryAfterMs:fallback.retryAfterMs,transport};
    else r={...r,transport};
   }
  }
  if(t.platform==='youtube'&&r.identityVerified)r.nativeId=t.id;return verifySystemIdentity(t,r);
 }};
}
