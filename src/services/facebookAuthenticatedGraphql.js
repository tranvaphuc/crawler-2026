import fs from 'node:fs';
import {snapshotPayloads} from './socialMetrics.js';
import * as facebookIdentities from './facebookAuthorIdentity.js';
import {FacebookFeedError,responseError,graphqlError} from '../../scripts/facebook_post_errors.js';
import {parseChunks} from '../../scripts/paginate_facebook_group_capture.js';
import {collectFacebookFeedbackIds,bindFacebookFeedbackVariables} from './facebookFeedbackIdentity.js';

const fail=code=>new FacebookFeedError(code,'Facebook comment session is unavailable or does not match the configured account',{category:'security'});
const walk=(value,visit,depth=0)=>{if(!value||typeof value!=='object'||depth>75)return;visit(value);for(const child of Object.values(value))if(child&&typeof child==='object')walk(child,visit,depth+1);};

// This file is configured by the server operator, never supplied in an API body.
// Credentials stay inside one HTTP binding; no cookie/CSRF enters checkpoints.
export function loadFacebookCommentSession(file){
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size>65536||(stat.mode&0o037)!==0)throw fail('FACEBOOK_SESSION_FILE_INVALID');
  const value=JSON.parse(fs.readFileSync(fd,'utf8'));
  if(!/^\d+$/.test(value.accountId||'')||typeof value.cookie!=='string'||value.cookie.length>32768||/[\r\n\0]/.test(value.cookie))throw fail('FACEBOOK_SESSION_FILE_INVALID');
  const cookies=new Map(value.cookie.split(';').map(pair=>{const at=pair.indexOf('=');if(at<1)throw fail('FACEBOOK_SESSION_FILE_INVALID');return[pair.slice(0,at).trim(),pair.slice(at+1).trim()];}));
  if(cookies.get('c_user')!==value.accountId||!cookies.get('xs')||[...cookies.keys()].some(k=>!/^[-\w]+$/.test(k)))throw fail('FACEBOOK_SESSION_FILE_INVALID');
  return{accountId:value.accountId,cookie:value.cookie};
 }catch(error){if(error instanceof FacebookFeedError)throw error;throw fail('FACEBOOK_SESSION_FILE_INVALID');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}

export function facebookAuthenticatedContext(snapshot,accountId){
 const http=responseError({status:snapshot.httpStatus,location:snapshot.finalUrl,retryAfter:snapshot.retryAfter});if(http)throw http;
 const roots=snapshotPayloads(snapshot.html||''),data={};
 for(const root of roots)walk(root,v=>{if(!Array.isArray(v))return;const[name,,value]=v;if(name==='CurrentUserInitialData')data.actor=String(value?.USER_ID||'');if(name==='LSD')data.lsd=value?.token;if(name==='DTSGInitialData')data.fb_dtsg=value?.token;if(name==='SiteData')data.site=value;});
 if(data.actor!==accountId)throw fail('FACEBOOK_SESSION_ACCOUNT_MISMATCH');
 if(!data.lsd||!data.fb_dtsg)throw fail('FACEBOOK_SESSION_CONTEXT_MISSING');
 const dynamic={__user:accountId,av:accountId,lsd:data.lsd,fb_dtsg:data.fb_dtsg,jazoest:'2'+[...data.fb_dtsg].reduce((n,c)=>n+c.charCodeAt(0),0)};
 for(const key of ['__spin_r','__spin_b','__spin_t'])if(data.site?.[key]!=null)dynamic[key]=String(data.site[key]);
 if(data.site?.client_revision!=null)dynamic.__rev=String(data.site.client_revision);
 if(data.site?.hsi!=null)dynamic.__hsi=String(data.site.hsi);
 if(data.site?.haste_session)dynamic.__hs=data.site.haste_session;
 return{dynamic,referer:snapshot.finalUrl,feedbackIds:collectFacebookFeedbackIds(roots),actorAliases:facebookIdentities.collectFacebookActorAliases?.(roots)||new Map(),commentAuthors:facebookIdentities.collectFacebookCommentAuthorIdentities([],{roots})};
}

export function createAuthenticatedFacebookGraphqlRequest(session,{bootstrapUrl,sessionFile,credentials}={}){
 if(typeof session.seedFacebookCookies!=='function')throw fail('FACEBOOK_SESSION_TRANSPORT_UNSUPPORTED');
 let context;
 const getContext=()=>context||=(async()=>{
  const configured=credentials||loadFacebookCommentSession(sessionFile);
  try{session.seedFacebookCookies(configured.cookie);}catch{throw fail('FACEBOOK_SESSION_ACCOUNT_MISMATCH');}
  return facebookAuthenticatedContext(await session.request(bootstrapUrl),configured.accountId);
 })();
 const request=async(form,headers={})=>{
  const ctx=await getContext(),body={...form,...ctx.dynamic};delete body.access_token;
  body.variables=bindFacebookFeedbackVariables(body.variables,ctx.feedbackIds);
  const safe=Object.fromEntries(Object.entries(headers).filter(([key])=>!/^cookie$|^authorization$|^host$|^content-length$|^sec-ch-ua/i.test(key)));
  const r=await session.request('https://www.facebook.com/api/graphql/',{method:'POST',headers:{...safe,origin:'https://www.facebook.com',referer:ctx.referer,'x-fb-lsd':ctx.dynamic.lsd,'content-type':'application/x-www-form-urlencoded','user-agent':'Mozilla/5.0'},body:new URLSearchParams(body).toString()});
  const http=responseError({status:r.httpStatus,location:r.finalUrl,retryAfter:r.retryAfter});if(http)throw http;
  let chunks=[];try{chunks=parseChunks(r.html);}catch{}
  for(const chunk of chunks)if(chunk.error){const known=graphqlError([{message:[chunk.errorSummary,chunk.errorDescription].filter(Boolean).join(' ')}],{unknownIsFatal:false});if(known){known.httpStatus=r.httpStatus;known.sourceCode=String(chunk.error);throw known;}throw fail('FACEBOOK_SESSION_REQUEST_REJECTED');}
  return{status:r.httpStatus,text:r.html,location:r.finalUrl,retryAfter:r.retryAfter};
 };
 request.resolveResponseAuthors=async comments=>{
  const ctx=await getContext();for(const c of comments){if(c.authorIdEvidence==='response.author_identity_conflict'||c.authorIdEvidence==='response.group_anonymous_post_id')continue;const proof=ctx.commentAuthors.get(c._id)||ctx.actorAliases.get(c.authorOpaqueId);if(!proof)continue;if(!proof.id||c.authorId&&c.authorId!==proof.id){c.authorId=null;c.authorIdEvidence='response.author_identity_conflict';}else{c.authorId=proof.id;c.authorIdEvidence=proof.evidence;}}return comments;
 };
 return request;
}
