import {facebookEmptySourceProof} from './facebookEmptySource.js';
import {readOnlyHtml} from './socialHtmlSnapshot.js';
import {snapshotPayloads} from './socialMetrics.js';
import {collectFacebookFeedbackIds,bindFacebookFeedbackVariables} from './facebookFeedbackIdentity.js';
import {sourceRestrictionEvidence} from './socialAuthGate.js';
import {FacebookFeedError,responseError} from '../../scripts/facebook_post_errors.js';
import {parseChunks} from '../../scripts/paginate_facebook_group_capture.js';
import {facebookAuthorRoute,parseFacebookAuthorRoutes,collectFacebookActorAliases,collectFacebookCommentAuthorIdentities} from './facebookAuthorIdentity.js';
function walk(v,visit,depth=0){if(!v||typeof v!=='object'||depth>75)return;visit(v);for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,visit,depth+1);}
const bootstrapFailure=error=>{if(error&&typeof error==='object'&&!error.stage)error.stage='bootstrap';throw error;};
function anonymousLoginPage(snapshot){
 if(snapshot.httpStatus!==200)return false;
 try{const url=new URL(snapshot.finalUrl);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['facebook.com','www.facebook.com'].includes(url.hostname)&&/^\/login(?:\/|\.php|$)/.test(url.pathname);}catch{return false;}
}
/** Current anonymous CSRF context, in RAM and bound to the same proxy/session. */
export function facebookAnonymousContext(snapshot,{sourceTarget,contextOnly=false}={}){
 if([404,410].includes(snapshot.httpStatus))throw new FacebookFeedError('TARGET_UNAVAILABLE','Public bootstrap target is unavailable',{category:'target',stage:'bootstrap',httpStatus:snapshot.httpStatus});
 // A generic login page can issue a fresh anonymous request context. This
 // does not establish access to a source: the native feed must still allow it.
 const loginContext=contextOnly&&anonymousLoginPage(snapshot);
 const httpError=responseError({status:snapshot.httpStatus,location:snapshot.finalUrl,retryAfter:snapshot.retryAfter});if(httpError&&!loginContext)throw httpError;
 const roots=snapshotPayloads(snapshot.html||'');
 const empty=facebookEmptySourceProof(snapshot,sourceTarget,roots);
 if(empty){const error=new FacebookFeedError('PUBLIC_ITEMS_NOT_RETURNED','Facebook confirms an empty public timeline',{category:'target',stage:'bootstrap',httpStatus:snapshot.httpStatus});error.emptySourceProof=empty;error.context={emptySourceProof:empty};throw error;}
 const $=readOnlyHtml(snapshot.html||'');
 // Only a page-level heading is evidence of target availability. Text inside
 // post/comment bodies or script bundles must never mark a live post deleted.
 const headings=$('h1,h2,[role="heading"]').map((_,e)=>$(e).text().trim().replace(/\s+/g,' ')).get();
 const deleted=headings.some(t=>/^(?:This post (?:has been|was) deleted[.!]?|Bài viết này đã bị xóa[.!]?)$/i.test(t));
 const unavailable=headings.some(t=>/^(?:This (?:content|page) isn't available(?: right now)?[.!]?|Content (?:isn't|not) available[.!]?|Nội dung này hiện không (?:hiển thị|khả dụng)[.!]?|Trang này hiện không khả dụng[.!]?)$/i.test(t));
 if(deleted||unavailable)throw new FacebookFeedError(deleted?'POST_DELETED':'TARGET_UNAVAILABLE',deleted?'Facebook explicitly reports this post deleted':'Public page reports unavailable; deletion, privacy or restrictions are not distinguished',{category:'target',stage:'bootstrap',httpStatus:snapshot.httpStatus});
 let token=null,site={},actor=null;
 for(const root of roots)walk(root,v=>{
  if(!Array.isArray(v))return;
  if(v[0]==='LSD'&&typeof v[2]?.token==='string')token=v[2].token;
  if(v[0]==='SiteData'&&v[2])site=v[2];
  if(v[0]==='CurrentUserInitialData')actor=String(v[2]?.USER_ID??'');
 });
 if(actor&&actor!=='0')throw new FacebookFeedError('ANONYMOUS_CONTEXT_REQUIRED','Refusing an authenticated bootstrap context',{category:'security'});
 if(loginContext&&actor!=='0')throw new FacebookFeedError('ANONYMOUS_CONTEXT_UNVERIFIED','Generic context requires an explicitly anonymous actor',{category:'security'});
 token ||= $('input[name="lsd"]').attr('value')||null;
 if(!token)throw new FacebookFeedError('ANONYMOUS_BOOTSTRAP_UNAVAILABLE','Anonymous request context was not returned',{category:'config'});
 const dynamic={lsd:token,__user:'0',av:'0'};
 for(const k of ['__spin_r','__spin_b','__spin_t'])if(site[k]!=null)dynamic[k]=String(site[k]);
 if(site.client_revision!=null)dynamic.__rev=String(site.client_revision);
 if(site.hsi!=null)dynamic.__hsi=String(site.hsi);
 if(site.haste_session)dynamic.__hs=String(site.haste_session);
 const j=$('input[name="jazoest"]').attr('value');if(j)dynamic.jazoest=j;
 return{dynamic,referer:snapshot.finalUrl,feedbackIds:collectFacebookFeedbackIds(roots),actorAliases:collectFacebookActorAliases(roots),commentAuthors:collectFacebookCommentAuthorIdentities([],{roots})};
}
export function createAnonymousFacebookGraphqlRequest(session,{bootstrapUrl,bootstrap=true,bootstrapSnapshot,sourceTarget,sourceContextFallback=false,missingContextFallback=false}={}){
 let context;
 const getContext=(headers={})=>context ||= (async()=>{
  const options={headers:{'user-agent':'Mozilla/5.0','accept-language':headers['accept-language']||'en-US,en;q=0.9'}};
  const snapshot=bootstrapSnapshot||await session.request(bootstrapUrl,options);
  try{return facebookAnonymousContext(snapshot,{sourceTarget});}catch(error){
   // This fallback only obtains anonymous context. A native GraphQL
   // login/rate/security error is never retried through this path. A tokenless
   // public comment page may refresh context too; a comment login redirect,
   // confirmed restriction or exact empty-source proof retains its policy.
   const missingContext=(sourceContextFallback||missingContextFallback)&&error.code==='ANONYMOUS_BOOTSTRAP_UNAVAILABLE';
   const sourceLogin=sourceContextFallback&&error.code==='AUTH_REQUIRED'&&anonymousLoginPage(snapshot);
   if(!(missingContext||sourceLogin)||sourceRestrictionEvidence(snapshot)?.confirmed)throw error;
   const root=await session.request('https://www.facebook.com/',options);
   const ctx=facebookAnonymousContext(root,{contextOnly:true});
   return {...ctx,referer:bootstrapUrl};
  }
 })().catch(bootstrapFailure);
 const request=async(form,headers)=>{
  const ctx=bootstrap?await getContext(headers):null;
  const body={...form,...ctx?.dynamic};delete body.fb_dtsg;delete body.access_token;body.__user='0';body.av='0';
  body.variables=bindFacebookFeedbackVariables(body.variables,ctx?.feedbackIds);
  const safeHeaders={...headers};for(const k of Object.keys(safeHeaders))if(/^(cookie|authorization|host|content-length)$/i.test(k))delete safeHeaders[k];
  safeHeaders.origin='https://www.facebook.com';safeHeaders.accept='*/*';safeHeaders['sec-fetch-site']='same-origin';safeHeaders['sec-fetch-mode']='cors';safeHeaders['sec-fetch-dest']='empty';
  safeHeaders['user-agent']='Mozilla/5.0';for(const k of Object.keys(safeHeaders))if(k.startsWith('sec-ch-ua'))delete safeHeaders[k];
  if(ctx){safeHeaders['x-fb-lsd']=ctx.dynamic.lsd;safeHeaders.referer=ctx.referer;}
  const r=await session.request('https://www.facebook.com/api/graphql/',{method:'POST',headers:{...safeHeaders,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
  // Error envelopes may be HTTP 200 and have no data/errors array.
  let chunks=[];try{chunks=parseChunks(r.html);}catch{}
  for(const c of chunks)if(c.error){
   const text=[c.errorSummary,c.errorDescription].filter(Boolean).join(' ');
   const {graphqlError}=await import('../../scripts/facebook_post_errors.js');
   const known=graphqlError([{message:text}],{unknownIsFatal:false});
   if(known){known.httpStatus=r.httpStatus;known.sourceCode=String(c.error);known.stage=form.fb_api_req_friendly_name||null;throw known;}
   throw new FacebookFeedError('FACEBOOK_REQUEST_REJECTED','Facebook rejected the anonymous request context',{category:'config',sourceCode:String(c.error)});
  }
  return{status:r.httpStatus,text:r.html,location:r.finalUrl,retryAfter:r.retryAfter};
 };
 request.resolveResponseAuthors=async comments=>{
  if(!bootstrap)return comments;
  const ctx=await getContext();
  for(const c of comments){
   if(c.authorIdEvidence==='response.author_identity_conflict'||c.authorIdEvidence==='response.group_anonymous_post_id')continue;
   const proof=ctx.commentAuthors.get(c._id)||ctx.actorAliases.get(c.authorOpaqueId);
   if(!proof)continue;
   if(!proof.id||c.authorId&&c.authorId!==proof.id){c.authorId=null;c.authorIdEvidence='response.author_identity_conflict';}
   else{c.authorId=proof.id;c.authorIdEvidence=proof.evidence;}
  }return comments;
 };
 request.resolveAuthorRoutes=async values=>{
  // Uses only fresh anonymous context from this session, never captured headers/forms.
  const routes=[...new Set(values.map(facebookAuthorRoute).filter(Boolean))].slice(0,10);if(!routes.length)return new Map();
  const ctx=await getContext();
  const form={__a:'1',__comet_req:'15',routing_namespace:'fb_comet',...ctx.dynamic};routes.forEach((route,i)=>form[`route_urls[${i}]`]=route);
  const r=await session.request('https://www.facebook.com/ajax/bulk-route-definitions/',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'Mozilla/5.0','accept':'*/*',origin:'https://www.facebook.com',referer:ctx.referer,'x-fb-lsd':ctx.dynamic.lsd},body:new URLSearchParams(form).toString()});
  const error=responseError({status:r.httpStatus,location:r.finalUrl,retryAfter:r.retryAfter});if(error)throw error;
  let data;try{data=JSON.parse(r.html.replace(/^for\s*\(;;\);\s*/,''));}catch{throw new FacebookFeedError('AUTHOR_IDENTITY_RESPONSE_INVALID','Public author routing response is invalid');}
  if(data.error)throw new FacebookFeedError('AUTHOR_IDENTITY_UNAVAILABLE','Public author routing did not resolve numeric IDs');
  return parseFacebookAuthorRoutes(data,routes);
 };
 return request;
}
