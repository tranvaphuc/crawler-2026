import {createGroupAnonymousContextCache} from './facebookGroupAnonymousContext.js';
import {facebookSourceBootstrapUrl} from './facebookEmptySource.js';
import {facebookSessionRequest} from './facebookSessionContexts.js';
import fs from 'node:fs/promises';
import {initializeFacebookCommentCoverage,observeFacebookCommentPage,facebookCommentCoverage} from './facebookCommentCoverage.js';
import {cachedFacebookCommentAuthor} from './facebookAuthorIdentity.js';
import {createAnonymousFacebookGraphqlRequest} from './facebookAnonymousGraphql.js';
import {createAuthenticatedFacebookGraphqlRequest} from './facebookAuthenticatedGraphql.js';
import {createHttpExecutor} from './socialHttpTransport.js';
import {createFacebookPostFetcher} from '../../scripts/facebook_posts.js';
import {createFacebookCommentFetcher} from '../../scripts/facebook_comments.js';
import {READ_STATE,attachReadState,cacheTransport} from './socialReadState.js';
import {HTTP_BINDING,bindHttpState} from './socialLeaseState.js';
import {contentBase} from './socialContent.js';
const paths={group:process.env.FACEBOOK_FEED_HAR_GROUP||'/Users/phuctran/Downloads/www.facebook.com.har',page:process.env.FACEBOOK_FEED_HAR_PAGE||'/Users/phuctran/Downloads/www.facebook.com_page.har',user:process.env.FACEBOOK_FEED_HAR_USER||'/Users/phuctran/Downloads/www.facebook.com_user.har'};
const mapError=e=>({status:/^PROXY_/.test(e.code)?'proxy_error':/AUTH|ACCESS_DENIED|^FACEBOOK_SESSION_/.test(e.code)?'auth_required':/SECURITY/.test(e.code)?'security_checkpoint':/RATE_LIMIT/.test(e.code)?'rate_limited':/SORT/.test(e.code)?'sort_unavailable':/TARGET_UNAVAILABLE|POST_DELETED/.test(e.code)?'unavailable':'error',reason:e.code||'FACEBOOK_READ_FAILED',retryAfterMs:e.retryAfterMs||null,...(e.context?.graphql?{upstreamContext:{graphql:e.context.graphql}}:{}),...(e.sourceCode?{upstreamCode:String(e.sourceCode)}:{}),...(e.httpStatus?{upstreamHttpStatus:e.httpStatus}:{}),...(e.stage?{upstreamQuery:e.stage}:{})});
export function createFacebookContentHttpReader(options={}){
 const commentSessionFile=options.facebookCommentSessionFile??process.env.FACEBOOK_COMMENT_SESSION_FILE;
 const execute=createHttpExecutor({...options,maxProxyPacingWaitMs:target=>target.operation==='source'&&target.sourceType==='group'&&Number.isFinite(options.facebookGroupPacingWaitMs)?options.facebookGroupPacingWaitMs:typeof options.maxProxyPacingWaitMs==='function'?options.maxProxyPacingWaitMs(target):options.maxProxyPacingWaitMs??0,anonymous:target=>!(target.operation==='comments'&&commentSessionFile)}),maxPages=options.maxPages||8,maxItems=options.maxItems||20000;
 const groupPageSize=options.facebookGroupSourcePageSize??100;
 if(!Number.isInteger(groupPageSize)||groupPageSize<1||groupPageSize>100)throw Object.assign(Error('FACEBOOK_GROUP_PAGE_SIZE_INVALID'),{code:'FACEBOOK_GROUP_PAGE_SIZE_INVALID'});
 const authorCache=new Map();let cacheReadAt=0;
 async function resolveAuthors(comments,request,session,deadline){
  const file=options.authorCacheFile||process.env.FACEBOOK_AUTHOR_UID_CACHE_FILE;
  if(file&&Date.now()-cacheReadAt>5000){cacheReadAt=Date.now();try{const d=JSON.parse(await fs.readFile(file));const next=new Map();for(const [key,v]of Object.entries(d.mappings||{}))if(/^\d+$/.test(v.id||''))next.set(key,v);authorCache.clear();for(const [key,v]of next)authorCache.set(key,v);}catch{}}
  for(const c of comments){const v=cachedFacebookCommentAuthor(c,authorCache);if(v){c.authorId=v.id;c.authorIdEvidence=v.evidence;}}
  if(options.resolveFacebookAuthors)await options.resolveFacebookAuthors(comments,request,deadline);
  while(authorCache.size>50000)authorCache.delete(authorCache.keys().next().value);
 }

 const deliver=(state,t,transport)=>{const items=state.items.splice(0,t.limit),more=state.items.length||state.pending;
  const coverage=t.operation==='comments'?facebookCommentCoverage(state,t):{recoveries:state.recoveries||0,complete:false,exhausted:!state.pending&&!state.budgetStopped,scope:'anonymous_public_response'};
  if(t.operation==='comments'&&commentSessionFile)coverage.scope='authenticated_account_response';
  const r={...contentBase(t),status:items.length||state.pending?'partial':t.operation==='source'||state.unfiltered&&!state.pending?'ok':'unavailable',reason:!more&&state.seen.size>0&&coverage.reason?coverage.reason:items.length?null:state.pending?'RECOVERY_IN_PROGRESS':state.unfiltered&&!state.pending?'NO_PUBLIC_COMMENTS_RETURNED':'PUBLIC_ITEMS_NOT_RETURNED',phase:!items.length&&state.pending?'collecting':'delivering',identityVerified:true,nativePostId:t.operation==='comments'?t.id:null,source:t.operation==='source'?{id:t.id,type:t.sourceType,profileId:t.profileId||null,url:t.url}:null,items,count:items.length,rootComments:items.filter(x=>x.type==='comment').length,replies:items.filter(x=>x.type==='reply').length,
  ordering:{requested:t.order,verified:items.every(x=>!!x.createdAt),scope:t.operation==='source'?'returned_page':'collected_public_items',serverFilterVerified:false,unfilteredVerified:state.unfiltered===true},coverage,pagination:{nextCursor:null,hasMore:!!more,complete:!more&&coverage.complete===true,reason:more?'CONTINUATION_AVAILABLE':'PUBLIC_CONTINUATIONS_EXHAUSTED'},transport};
  if(more)attachReadState(r,state);return r;};
 return async target=>{
  const commentSourceType=target.sourceType||(/^https:\/\/www\.facebook\.com\/groups\//.test(target.url||'')?'group':undefined);
  let state=target[READ_STATE];if(state?.items.length&&(!state.collecting||options.streamComments))return deliver(state,target,cacheTransport(state.transport));
  let keep=state,groupContextCache=null,sharedGroupContext=false;const binding=state?.[HTTP_BINDING]||{};
  const result=await execute({...target,pool:target.operation==='comments'?'facebook_api_comments':`facebook_${target.sourceType}_posts`},async(session,_deadline,meta)=>{
   if(meta?.sessionChanged&&state){state.recoveries=(state.recoveries||0)+1;}
   if(options.reuseFacebookGroupAnonymousContext&&target.operation==='source'&&target.sourceType==='group')groupContextCache=createGroupAnonymousContextCache(binding,session); // Native cursors remain bound to the same source/post; only anonymous CSRF/session is refreshed.
   // Anonymous context belongs to this live session; reuse it across native pages.
   const createRequest=onBootstrap=>{
    const anonymousContextSeed=groupContextCache?.read();sharedGroupContext=!!anonymousContextSeed;
    if(sharedGroupContext)options.onFacebookSessionEvent?.('group_context_shared');
    const bootstrapUrl=facebookSourceBootstrapUrl(target),boundSession=onBootstrap?{seedFacebookCookies:header=>session.seedFacebookCookies(header),request:async(...args)=>{const snapshot=await session.request(...args);if(String(args[0])===bootstrapUrl&&(!args[1]?.method||args[1].method==='GET'))onBootstrap();return snapshot;}}:session;
    if(target.operation==='comments'&&commentSessionFile)return createAuthenticatedFacebookGraphqlRequest(boundSession,{bootstrapUrl,sessionFile:commentSessionFile});
    return createAnonymousFacebookGraphqlRequest(boundSession,{bootstrapUrl,anonymousContextSeed,onAnonymousContext:context=>groupContextCache?.observe(context),bootstrap:options.bootstrapFacebook!==false,sourceContextFallback:target.operation==='source',missingContextFallback:true,sourceTarget:target.operation==='source'&&!state?.nativeCursor&&!state?.seen?.size?target:undefined});
   };
   let request;
   if(options.reuseFacebookCommentSessions&&target.operation==='comments')request=facebookSessionRequest(binding,session,target,createRequest,{onEvent:action=>options.onFacebookSessionEvent?.(action)});
   else{if(binding.facebookRequestSession!==session){binding.facebookRequest=createRequest();binding.facebookRequestSession=session;}request=binding.facebookRequest;}
   try{
    if(target.operation==='source'){
     state ||= {kind:'facebook',items:[],seen:new Set(),nativeCursor:null,pending:true,collecting:false};keep=state;
     const fetch=(options.createPostFetcher||createFacebookPostFetcher)({harPaths:paths,request,delayMs:0,maxPages:1,pageSize:target.sourceType==='group'?groupPageSize:100});
     const r=await fetch({groupId:target.profileId||target.id,type:target.sourceType,numberPosts:target.limit,cursor:state.nativeCursor});
     state.nativeCursor=r.cursor;state.pending=r.hasNextPage;
     for(const p of r.posts)if(!state.seen.has(p._id)){state.seen.add(p._id);state.items.push({id:`${target.id}_${p._id}`,systemId:`${target.id}_${p._id}`,sourceId:target.id,postId:String(p._id),url:`https://www.facebook.com/${target.id}_${p._id}`,originalUrl:p.originalUrl||p.url||null,mediaId:p.mediaId||null,mediaType:p.mediaType||null,type:'post',platform:'facebook',text:p.content,author:{id:target.sourceType==='page'&&p.authorId===target.profileId?target.id:p.authorId,profileId:p.authorId,name:p.author},createdAt:p.created_time?new Date(p.created_time*1000).toISOString():null,pinned:p.pinned,pinEvidence:p.pinEvidence,metrics:{likes:p.like,shares:p.shares,comment:p.comment}});}
     state.estimatedBytes=(state.estimatedBytes||1000)+Buffer.byteLength(JSON.stringify(r.posts));if(state.seen.size>=maxItems){state.budgetStopped=state.pending;state.pending=false;}
     state.items.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));const delivered=deliver(state,target,null);if(options.splitFacebookPages)delivered.nativePageCount=r.posts.length;return delivered;
    }
    state ||= {kind:'facebook',items:[],seen:new Set(),queue:[{idGetComment:target.id,cursor:null}],queued:new Set(),pending:true,collecting:true,unfiltered:false};keep=state;
    initializeFacebookCommentCoverage(state);
    let nativeResponse=null;
    const fetch=(options.createCommentFetcher||createFacebookCommentFetcher)({harPath:process.env.FACEBOOK_COMMENTS_HAR||paths.group,request,pageSize:100,onResponse:value=>{nativeResponse=value;}});
    for(let n=0;n<maxPages&&state.queue.length&&state.seen.size<maxItems;n++){
     const job=state.queue[0],r=await fetch({idPost:target.id,sourceType:commentSourceType,...job,...(target.commentId&&job.idGetComment===target.id&&job.cursor===null?{focusCommentId:target.commentId}:{})});await resolveAuthors(r.comments,request,session,_deadline);
     const unresolved=r.comments.filter(c=>!/^\d+$/.test(c.authorId||''));
     if(nativeResponse&&unresolved.length)await options.onFacebookAuthorResponse?.({...nativeResponse,sourceType:target.sourceType,unresolved:unresolved.map(c=>({id:c._id,opaqueId:c.authorOpaqueId,profileUrl:c.authorUrl,createdAt:c.time,evidence:c.authorIdEvidence}))});
     nativeResponse=null;
     if(r.hasNextPage&&!r.cursor)throw Object.assign(Error('PAGINATION_ERROR'),{code:'PAGINATION_ERROR'});
     for(const cursor of [r.hasNextPage?r.cursor:null,r.alternateCursor].filter(Boolean)){const key=JSON.stringify({...job,cursor});if(state.queued.has(key)&&!state.queue.some(q=>JSON.stringify(q)===key)){state.paginationStalled=true;throw Object.assign(Error('NATIVE_PAGINATION_STALLED'),{code:'NATIVE_PAGINATION_STALLED'});}}
     observeFacebookCommentPage(state,r,job,target.id);state.queue.shift();state.queued.add(JSON.stringify(job));
     const enqueue=(j,continuation=false)=>{const key=JSON.stringify(j);if(state.queued.has(key)){if(continuation&&!state.queue.some(q=>JSON.stringify(q)===key)){state.paginationStalled=true;throw Object.assign(Error('NATIVE_PAGINATION_STALLED'),{code:'NATIVE_PAGINATION_STALLED'});}return;}state.queued.add(key);state.queue.push(j);};
     if(r.hasNextPage&&r.cursor)enqueue({...job,cursor:r.cursor},true);if(r.alternateCursor)enqueue({...job,cursor:r.alternateCursor},true);
     for(const c of r.comments){const reply=job.idGetComment!==target.id;
      if(target.includeReplies&&(reply?c.repliesCount>0:options.splitFacebookPages?c.repliesCount>0:c.repliesCount!==0))enqueue({idGetComment:c._id,cursor:c.replyCursor||null});
      if(state.seen.has(c._id))continue;state.seen.add(c._id);
      state.items.push({id:c._id,postId:target.id,url:c.url,type:reply?'reply':'comment',nativeObservedAt:new Date().toISOString(),parentId:reply?job.idGetComment:null,platform:'facebook',text:c.content,author:{id:c.authorId,name:c.author,profileUrl:c.authorUrl||null,opaqueId:c.authorOpaqueId||null,idEvidence:c.authorIdEvidence||null},createdAt:c.time,likes:c.like,replyCount:c.repliesCount});
     }
    }
    state.estimatedBytes=Buffer.byteLength(JSON.stringify(state.items))+Buffer.byteLength(JSON.stringify(state.queue))+state.seen.size*30;
    state.pending=state.queue.length>0&&state.seen.size<maxItems;state.collecting=state.pending;
    if(state.collecting&&options.streamComments&&state.items.length)return deliver(state,target,null);
    if(state.collecting)return attachReadState({...contentBase(target),status:'partial',reason:'COLLECTION_IN_PROGRESS',phase:'collecting',stagedCount:state.items.length,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'HTTP_PAGE_BUDGET'}},state);
    state.items.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));return deliver(state,target,null);
   }catch(e){const empty=e.emptySourceProof||e.context?.emptySourceProof;
    if(empty&&state)state.pending=false;
    const fail={...contentBase(target),...mapError(e),...(empty?{status:'unavailable',identityVerified:true,source:{id:target.id,type:target.sourceType,profileId:empty.profileId,url:target.url},emptySourceProof:empty,coverage:{complete:true,exhausted:true,scope:'anonymous_public_response'},pagination:{nextCursor:null,hasMore:false,complete:true,reason:'PUBLIC_CONTINUATIONS_EXHAUSTED'}}:{}),...(e.code==='COMMENT_TARGET_MISMATCH'?{upstreamContext:e.context}:{}),upstreamOperation:e.stage==='bootstrap'?'bootstrap':target.operation==='source'?'source':e.context?.mode||(/Depth\d|Repl/.test(e.stage||'')?'replies':'comments')};if(state)attachReadState(fail,state);return fail;}
  },binding);
  const keepGroupSession=options.reuseFacebookGroupSessions&&target.operation==='source'&&target.sourceType==='group'&&result.identityVerified===true&&['ok','partial'].includes(result.status);
  if(groupContextCache){if(keepGroupSession){const confirmed=groupContextCache.confirm();if(sharedGroupContext&&confirmed)options.onFacebookSessionEvent?.('group_context_shared_confirmed');}else if(result.reason!=='PROXY_PACING_WAIT')groupContextCache.clear();}
  if(state)bindHttpState(state,binding);if(!keepGroupSession&&!state?.pending&&!(options.reuseFacebookCommentSessions&&target.operation==='comments'&&result.identityVerified===true))await binding.dispose?.();
  if(state)state.transport=result.transport;
  const final={...contentBase(target),...result};if(state&&(state.items.length||state.pending||keepGroupSession||options.reuseFacebookCommentSessions&&target.operation==='comments'))attachReadState(final,state);else if(keep&&!['ok','partial','unavailable'].includes(result.status))attachReadState(final,keep);return final;
 };
}
