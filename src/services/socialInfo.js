import {instagramProfileIdentity} from './instagramIdentity.js';
import {createFacebookContentHttpReader} from './facebookContentHttp.js';
import {disposeReadState} from './socialLeaseState.js';
import {READ_STATE} from './socialReadState.js';
import {createHttpExecutor} from './socialHttpTransport.js';
import {assignedJson,snapshotPayloads,extractSocialMetrics,normalizeMetricsInput} from './socialMetrics.js';
import {metaPost,walkContent,contentBase,normalizeContentInput} from './socialContent.js';
import {createFacebookHttpReaders} from './facebookHttpReader.js';
import {createSocialHttpContentReader} from './socialHttpReaders.js';
import {classifySocialUrl,ReferenceError} from './socialSystemReference.js';
const nativeId=v=>typeof v==='string'?v:Number.isSafeInteger(v)?String(v):null;
import {extractPostInfo} from './socialPostInfo.js';
export {extractPostInfo} from './socialPostInfo.js';
export function createSocialInfoReaders(options={}){
 const execute=createHttpExecutor(options),fb=createFacebookHttpReaders(options),socialComments=createSocialHttpContentReader({...options,maxPages:2}),fbComments=createFacebookContentHttpReader({...options,maxPages:2});
 const comments=target=>target.platform==='facebook'?fbComments(target):socialComments(target);
 const postInfo=async target=>{
  if(target.platform==='tiktok')return {platform:'tiktok',operation:'post_info',status:'unavailable',reason:'TIKTOK_POST_INFO_NOT_SUPPORTED',identityVerified:false,post:null};
  if(target.platform==='facebook'){const r=await fb.details(target.facebook?.inputUrl||target.url,target.apiOperation||'post_info');return{...r,operation:'post_info',platform:'facebook',status:r.ok?'partial':/PROXY/.test(r.reason||'')?'proxy_error':/RATE_LIMIT/.test(r.reason||'')?'rate_limited':/AUTH|LOGIN|ACCESS/.test(r.reason||'')?'auth_required':/SECURITY|CHECKPOINT/.test(r.reason||'')?'security_checkpoint':/TIMEOUT|NETWORK|ERROR|FAILED/.test(r.reason||'')?'error':'unavailable',identityVerified:r.ok===true};}
  return execute({...target,apiOperation:target.apiOperation||'post_info'},async session=>extractPostInfo(target,await session.request(target.url)));
 };
 const sourceInfo=async reference=>{
  if(!reference.url&&reference.seedPostUrl){const r=await postInfo(normalizeMetricsInput({url:reference.seedPostUrl}));const a=r.post?.author;if(r.identityVerified&&a?.id===reference.id&&a.username)return{...reference,url:`https://www.instagram.com/${a.username}/`,username:a.username,status:'resolved',idVerified:true,evidence:'matched_seed_post.author.id_username',transport:r.transport};return{...reference,status:r.status,reason:r.reason||'SOURCE_USERNAME_UNVERIFIED',idVerified:false};}
  return execute({...reference,apiOperation:'resolve_source'},async session=>{
  const snap=await session.request(reference.url),result={...reference,status:'unavailable',id:null,idVerified:false,evidence:null,checkedAt:new Date().toISOString()};
  if(snap.httpStatus!==200)return{...result,status:snap.httpStatus===429?'rate_limited':[401,403].includes(snap.httpStatus)?'auth_required':snap.httpStatus>=500?'error':'unavailable',reason:'UPSTREAM_HTTP_'+snap.httpStatus,retryAfterMs:snap.retryAfterMs};
  if(/\/(login|checkpoint|challenge|accounts\/login)(?:\/|\.php|\?|$)/.test(snap.finalUrl))return{...result,status:'auth_required',reason:'LOGIN_OR_CHECKPOINT'};
  const roots=snapshotPayloads(snap.html),personalIds=new Set();for(const root of roots)walkContent(root,v=>{if(v.is_additional_profile_plus===false&&v.id)personalIds.add(String(v.id));});const initial=assignedJson(snap.html||'','ytInitialData');
  if(reference.platform==='instagram'){const username=reference.username||new URL(reference.url).pathname.split('/').filter(Boolean)[0],identity=instagramProfileIdentity(roots,username);return identity.verified?{...result,id:identity.id,webScopedId:identity.webScopedId,username:identity.username,name:identity.name,type:'profile',status:'resolved',idVerified:true,evidence:identity.evidence}:{...result,reason:identity.reason};}
  if(reference.platform==='youtube'){
   const m=initial?.metadata?.channelMetadataRenderer;if(m?.externalId){const urls=[m.vanityChannelUrl,m.channelUrl,...(m.ownerUrls||[])].filter(Boolean);const expected=new URL(reference.url).pathname.replace(/\/videos\/?$/,'').toLowerCase();if(urls.some(x=>{try{return new URL(x).pathname.toLowerCase()===expected;}catch{return false;}}))Object.assign(result,{id:m.externalId,type:'channel',name:m.title||null,idVerified:true,evidence:'matched_channelMetadataRenderer.externalId'});}
  }else{
   const expected=reference.username||new URL(reference.url).pathname.split('/').filter(Boolean)[0]?.replace(/^@/,'');
   for(const root of roots)walkContent(root,v=>{
    if(reference.platform!=='facebook'&&v.username?.toLowerCase()===expected?.toLowerCase()&&(v.pk||v.id))Object.assign(result,{id:nativeId(v.pk)||nativeId(v.id),name:v.full_name||null,username:v.username,type:'profile',idVerified:true,evidence:'matched_username.native_user_id'});
    if(reference.platform==='facebook'){
     // Ignore Story/pfbid entities and compare profile.php IDs as well as paths.
     if(!/^\d+$/.test(nativeId(v.id)||''))return;
     const matchUrl=raw=>{try{const a=classifySocialUrl(raw);if(a.platform!=='facebook'||a.kind!=='source')return false;return [reference.url,snap.finalUrl].filter(Boolean).some(url=>{try{const b=classifySocialUrl(url);if(b.platform!=='facebook'||b.kind!=='source')return false;if(a.id&&b.id)return a.id===b.id;return new URL(a.url).pathname.replace(/\/$/,'').toLowerCase()===new URL(b.url).pathname.replace(/\/$/,'').toLowerCase();}catch{return false;}});}catch{return false;}};
     const numeric=reference.id&&/^\d+$/.test(reference.id)&&String(v.id)===reference.id;
     if(v.name&&(v.is_additional_profile_plus===false||personalIds.has(String(v.id)))&&(matchUrl(v.url)||numeric))Object.assign(result,{id:nativeId(v.id),profileId:nativeId(v.id),type:'user',name:v.name,idVerified:true,evidence:'matched_User.explicit_personal_profile'});
     else if(v.name&&(matchUrl(v.url)||numeric||String(v.delegate_page?.id)===reference.id)&&/^\d+$/.test(String(v.delegate_page?.id||''))&&v.is_additional_profile_plus!==false&&!personalIds.has(String(v.id)))Object.assign(result,{id:String(v.delegate_page.id),profileId:nativeId(v.id),type:'page',name:v.name,idVerified:true,evidence:'matched_profile.delegate_page.id'});
     else if(v.name&&(matchUrl(v.url)||numeric)&&v.__typename==='Page'&&!result.idVerified)Object.assign(result,{id:nativeId(v.id),type:'page',name:v.name,idVerified:true,evidence:'matched_Page.id'});
     else if(v.name&&numeric&&v.__typename==='Group')Object.assign(result,{id:nativeId(v.id),type:'group',name:v.name,idVerified:true,evidence:'matched_Group.id'});
     else if(v.name&&(matchUrl(v.url)||numeric)&&v.__typename==='User'&&(v.is_additional_profile_plus===false||Object.hasOwn(v,'delegate_page')&&v.delegate_page===null)&&!result.idVerified)Object.assign(result,{id:nativeId(v.id),type:'user',name:v.name,idVerified:true,evidence:'matched_User.id'});
    }
   });
  }
  if(result.idVerified)result.status='resolved';else result.reason='SOURCE_ID_NOT_IN_PUBLIC_RESPONSE';return result;
 });};
 const commentInfo=async reference=>{
  if(reference.platform==='threads'){const r=await postInfo({...normalizeMetricsInput({url:reference.url}),apiOperation:'comment_info'});const item=r.post?.id===reference.id?r.post:null;return{platform:'threads',operation:'comment_info',id:reference.id,comment:item?{...item,type:'comment',parentId:reference.parentSystemId||null,parentIdScope:'es5_system_id'}:null,identityVerified:!!item,status:item?'partial':r.status,reason:item?null:r.reason||'COMMENT_ID_NOT_VERIFIED',transport:r.transport,retryAfterMs:r.retryAfterMs||null,checkedAt:new Date().toISOString()};}

  const target=normalizeContentInput('comments',{url:reference.parentUrl||reference.url,includeReplies:true,order:'platform_default',limit:100});
  target.apiOperation='comment_info';
  if(reference.platform==='youtube')target.url+='&lc='+encodeURIComponent(reference.id);if(reference.platform==='facebook')target.commentId=reference.id;
  const r=await comments(target),item=[...(r.items||[]),...(r[READ_STATE]?.items||[])].find(x=>x.id===reference.id);await disposeReadState(r[READ_STATE]);
  return{platform:reference.platform,operation:'comment_info',id:reference.id,comment:item||null,identityVerified:!!item,status:!['ok','partial','unavailable'].includes(r.status)?r.status:item?'partial':'unavailable',reason:!['ok','partial','unavailable'].includes(r.status)?r.reason:item?null:r.reason||'COMMENT_NOT_IN_PUBLIC_WINDOW',transport:r.transport,retryAfterMs:r.retryAfterMs||null,coverage:{complete:false,scope:'bounded_public_comment_window'},checkedAt:new Date().toISOString()};
 };
 return{postInfo,sourceInfo,commentInfo};
}
