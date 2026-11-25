import {createHttpExecutor,httpFailure} from './socialHttpTransport.js';
import {metaBootstrap,requestMetaQuery} from './socialMetaRequests.js';
import {contentBase,extractContentSnapshot} from './socialContent.js';
import {exactSort} from './socialOrdering.js';
import {normalizeMetricsInput,extractSocialMetrics} from './socialMetrics.js';
import {publicApiIssue} from './socialApiErrors.js';
import {READ_STATE,attachReadState,cacheTransport} from './socialReadState.js';
import {HTTP_BINDING,bindHttpState} from './socialLeaseState.js';
import {META_COMMENT_POLICY,META_COMMENT_QUERIES,metaInitialCounter,metaBoundMedia,parseMetaCommentPage,metaCommentCoverage,metaQueueKey} from './metaCommentPagination.js';
const terminal=new Set(['error','auth_required','security_checkpoint','rate_limited','unavailable']);
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createMetaCommentHttpReader(options={}){
 const execute=createHttpExecutor(options),maxPages=options.maxPages||8,maxItems=options.maxItems||20000;
 function deliver(state,target,transport){
  const items=state.items.splice(0,target.limit);
  if(target.platform==='threads')for(const item of items){const ancestors=[],seen=new Set([item.id]);let id=item.id,valid=true;while(id!==state.context.nativeId){const fact=state.context.facts.get(id);if(!fact||!['native_reply_level_stack','native_reply_to_post'].includes(fact.parentEvidence)){valid=false;break;}const parent=fact.type==='comment'?state.context.nativeId:fact.parentId;if(!parent||seen.has(parent)){valid=false;break;}ancestors.push(parent);seen.add(parent);id=parent;if(ancestors.length>64){valid=false;break;}}if(valid&&ancestors.length)item.nativeThreadContext={policy:'native_reply_ancestry_v1',rootId:state.context.nativeId,ancestors,observedAt:state.dateObservedAt||new Date().toISOString()};}
  const coverage=metaCommentCoverage(state,target),more=state.items.length>0||state.queue.length>0,pagination={nextCursor:null,hasMore:more,complete:!more&&coverage.complete,reason:more?'NATIVE_CONTINUATION_AVAILABLE':state.context.unavailable.length?'NATIVE_PAGINATION_UNAVAILABLE':'PUBLIC_CONTINUATIONS_EXHAUSTED'},sorted=target.order==='oldest'?exactSort(items,'oldest'):{items,verified:false,missing:0};
  const r={...contentBase(target),status:'partial',reason:coverage.complete?null:coverage.reason,identityVerified:true,nativePostId:state.context.nativeId,items:sorted.items,count:items.length,rootComments:items.filter(x=>x.type==='comment').length,replies:items.filter(x=>x.type==='reply').length,phase:'delivering',coverage,pagination,ordering:{requested:target.order,verified:sorted.verified,scope:more?'returned_page':'collected_public_items',evidence:sorted.verified?'exact_createdAt_sort':null,missingTimestamps:sorted.missing},transport};
  if(more||state.context.unavailable.length)attachReadState(r,state);return r;
 }
 const enqueue=(state,j)=>{const key=metaQueueKey(j);if(state.visited.has(key))fail('NATIVE_PAGINATION_STALLED');if(!state.queued.has(key)){state.queued.add(key);state.queue.push(j);}};
 function schedulePositiveChildren(state,target){
  if(target.platform!=='threads'||!target.includeReplies||state.queue.length)return;
  const observed=new Map();for(const f of state.context.facts.values())if(f.parentId)observed.set(f.parentId,(observed.get(f.parentId)||0)+1);
  for(const f of state.context.facts.values())if(f.url&&Number.isSafeInteger(f.replyCount)&&f.replyCount>(observed.get(f.id)||0)){const j={kind:'children',parentId:f.id,cursor:null,url:f.url};if(!state.queued.has(metaQueueKey(j)))enqueue(state,j);}
 }
 function ingest(state,page,target,currentKey=null){
  for(const j of page.next)if((target.includeReplies||j.kind==='roots')&&(metaQueueKey(j)===currentKey||state.visited.has(metaQueueKey(j))))fail('NATIVE_PAGINATION_STALLED');
  // Validate the complete page before advancing its cursor or accepting any row.
  for(const x of page.items){if(!target.includeReplies&&x.type==='reply')continue;const prior=state.context.facts.get(x.id);if(prior&&(prior.type!==x.type||prior.parentId!==x.parentId))fail('META_REPLY_PARENT_CONFLICT');}
  for(const x of page.items){if(!target.includeReplies&&x.type==='reply')continue;if(!state.seenIds.has(x.id)){state.items.push({...x,nativeObservedAt:new Date().toISOString()});state.seenIds.add(x.id);}state.context.facts.set(x.id,{id:x.id,type:x.type,parentId:x.parentId,replyCount:x.replyCount,url:x.url,parentEvidence:x.parentEvidence});}
  state.context.levels=page.levels;state.context.postIds=page.postIds;for(const j of page.next)if(target.includeReplies||j.kind==='roots')enqueue(state,j);if(target.includeReplies)for(const j of page.unavailable)if(!state.context.unavailable.some(x=>JSON.stringify(x)===JSON.stringify(j)))state.context.unavailable.push(j);
 }
 return async target=>{
  let state=target[READ_STATE]||null;if(state?.kind!=='meta_comments')state=null;
  if(state?.items.length&&(options.streamComments||!state.queue.length))return deliver(state,target,cacheTransport(state.transport));
  const binding=state?.[HTTP_BINDING]||{};let nextState=state;
  const value=await execute(target,async(session,deadline,meta)=>{
   try{
    let initialized=false;
    if(!binding.metaConfig||meta?.sessionChanged||binding.metaConfigEpoch!==meta?.epoch||!state){
     binding.metaConfig=null;binding.metaConfigEpoch=meta?.epoch;binding.metaChildren=new Map();
     const snapshot={...await session.request(target.url),observedAt:new Date().toISOString()},base=extractContentSnapshot(target,snapshot);
     if(terminal.has(base.status)&&base.status!=='unavailable'||!base.identityVerified)return base;
     const boot=metaBootstrap(snapshot.html),bound=metaBoundMedia(target,snapshot,state?.context.postIds||[]);if(state&&bound.nativeId!==state.context.nativeId)fail('META_POST_IDENTITY_CHANGED');
     binding.metaConfig={...boot,providerFlags:Object.assign({},...boot.queries.map(q=>Object.fromEntries(Object.entries(q.variables).filter(([k])=>k.startsWith('__relay_internal__pv__')))))};
     if(!state){
      let page;try{page=parseMetaCommentPage(target,snapshot);}catch(e){
       if(!/META_COMMENT_CONNECTION|META_NATIVE_PAGINATION/.test(e.code||''))throw e;
       const count=metaInitialCounter(target,snapshot);
       state={kind:'meta_comments',items:base.items,seenIds:new Set(base.items.map(i=>i.id)),queue:[],queued:new Set(),visited:new Set(),context:{nativeId:bound.nativeId,postIds:bound.postIds,countScope:count.scope,facts:new Map(base.items.map(i=>[i.id,{id:i.id,type:i.type,parentId:i.parentId,replyCount:i.replyCount}])),levels:new Map(),unavailable:[{kind:'unverified_connection'}],policy:META_COMMENT_POLICY},expected:count.expected};nextState=state;
       // A verified post can expose a positive native counter while omitting
       // the connection in its HTML. Ask its native root query; do not infer
       // EOF or discard the post because its bootstrap omitted this fragment.
       if(target.platform==='threads'&&e.code==='META_COMMENT_CONNECTION_UNVERIFIED'&&count.scope==='roots'&&count.expected>0&&!base.items.length&&boot.lsd){
        state.context.unavailable=[];enqueue(state,{kind:'roots',parentId:null,cursor:null});
       }
       return deliver(state,target,null);
      }
      const count=metaInitialCounter(target,snapshot);state={kind:'meta_comments',items:[],seenIds:new Set(),queue:[],queued:new Set(),visited:new Set(),context:{nativeId:bound.nativeId,postIds:bound.postIds,countScope:count.scope,facts:new Map(),levels:new Map(),unavailable:[],policy:META_COMMENT_POLICY},expected:count.expected,dateObservedAt:snapshot.observedAt};nextState=state;ingest(state,page,target);initialized=true;
     }
    }
    schedulePositiveChildren(state,target);
    if(initialized&&options.streamComments&&state.items.length)return deliver(state,target,null);
    let pages=0;
    while(state.queue.length&&pages<maxPages&&Date.now()<deadline-1000&&state.seenIds.size<maxItems){
     const j=state.queue[0],key=metaQueueKey(j);if(state.visited.has(key))fail('NATIVE_PAGINATION_STALLED');if(!binding.metaConfig.lsd)fail('ANONYMOUS_QUERY_CONTEXT_UNAVAILABLE');
     let config=binding.metaConfig,scopeIds=state.context.postIds,scopedJob={...j,rootNativeId:state.context.nativeId};
     if(j.kind==='children'){
      let child=binding.metaChildren?.get(j.parentId);if(!child){const childTarget=normalizeMetricsInput({url:j.url}),snapshot={...await session.request(childTarget.url),observedAt:new Date().toISOString()},base=extractContentSnapshot({...childTarget,operation:'comments',includeReplies:true},snapshot);if(['auth_required','security_checkpoint','rate_limited','error'].includes(base.status))return{...base,retryAfterMs:snapshot.retryAfterMs||base.retryAfterMs,items:[],count:0,pagination:{hasMore:true,complete:false}};if(!base.identityVerified){state.context.unavailable.push({kind:'child_post_unverified',parentId:j.parentId,cursor:j.cursor,url:j.url});state.queue.shift();state.visited.add(key);schedulePositiveChildren(state,target);continue;}const media=metaBoundMedia(childTarget,snapshot);if(media.nativeId!==j.parentId)fail('META_REPLY_PARENT_CONFLICT');const counter=extractSocialMetrics(childTarget,snapshot).metrics.comment;if(!Number.isSafeInteger(counter)||counter<0){state.context.unavailable.push({kind:'child_counter_unverified',parentId:j.parentId,cursor:j.cursor});state.queue.shift();state.visited.add(key);schedulePositiveChildren(state,target);continue;}const fact=state.context.facts.get(j.parentId);if(fact)fact.replyCount=counter;const buffered=state.items.find(i=>i.id===j.parentId);if(buffered)buffered.replyCount=counter;if(counter===0){state.queue.shift();state.visited.add(key);schedulePositiveChildren(state,target);continue;}const boot=metaBootstrap(snapshot.html);child={...boot,providerFlags:Object.assign({},...boot.queries.map(q=>Object.fromEntries(Object.entries(q.variables).filter(([k])=>k.startsWith('__relay_internal__pv__'))))),postIds:media.postIds,scopeCode:childTarget.id};binding.metaChildren ||=new Map();binding.metaChildren.set(j.parentId,child);
       if(j.cursor===null){try{const page=parseMetaCommentPage(target,snapshot,{postIds:child.postIds,job:{...j,scopeCode:child.scopeCode,rootNativeId:state.context.nativeId},knownLevels:state.context.levels});page.postIds=state.context.postIds;for(const q of page.next)if(q.kind==='children'){q.url=j.url;q.scopeCode=child.scopeCode;}ingest(state,page,target,key);const direct=page.items.filter(i=>i.parentId===j.parentId).length;if(page.next.length||direct===counter){state.queue.shift();state.visited.add(key);pages++;schedulePositiveChildren(state,target);continue;}}catch(e){if(e.code!=='META_COMMENT_CONNECTION_UNVERIFIED')throw e;}}
      }
      config=child;scopeIds=child.postIds;scopedJob.scopeCode=child.scopeCode;
     }
     const query=META_COMMENT_QUERIES[j.kind==='inline'?'threads_inline':target.platform],variables=target.platform==='instagram'?{media_id:state.context.nativeId,first:24,after:j.cursor}:{...config.providerFlags,...(j.kind==='inline'?{postID:j.parentId,permalinkPostID:state.context.nativeId,expansionType:j.cursor?'breadth':'default',pagingToken:j.cursor}:{postID:j.kind==='children'?j.parentId:state.context.nativeId,sortOrder:config.queries.find(q=>q.name==='BarcelonaPostPageDownwardQuery')?.variables?.sortOrder||'recent',filterType:null,first:10,after:j.cursor})};
     const response=await requestMetaQuery(session,target,config,query,variables);pages++;
     if(response.httpStatus!==200)return{...contentBase(target),status:response.httpStatus===429?'rate_limited':[401,403].includes(response.httpStatus)?'auth_required':'error',reason:'UPSTREAM_HTTP_'+response.httpStatus,retryAfterMs:response.retryAfterMs,items:[],pagination:{nextCursor:null,hasMore:true,complete:false}};
     // A native field_exception is an upstream failure, not proof that the query
     // or public identity is invalid. Retain the cursor for bounded retry.
     const issue=publicApiIssue([response.html]);if(issue){
      // Some native inline expansions fail with field_type_nullability_mismatch.
      // Re-read that exact, previously verified reply through its public
      // permalink. The child reader verifies its ID, counter and ancestry;
      // this is pending work, never a successful empty page or an auth retry.
      const fact=j.kind==='inline'&&issue.status==='error'&&state.context.facts.get(j.parentId);
      const child=fact?.url?{kind:'children',parentId:j.parentId,cursor:null,url:fact.url}:null;
      if(child&&!state.visited.has(metaQueueKey(child))){
       enqueue(state,child);state.queue.shift();state.visited.add(key);continue;
      }
      return{...contentBase(target),...issue,items:[],pagination:{nextCursor:null,hasMore:true,complete:false}};
     }
     const page=parseMetaCommentPage(target,{html:'',jsonResponses:[response.html],httpStatus:response.httpStatus,finalUrl:target.url},{postIds:scopeIds,job:scopedJob,knownLevels:state.context.levels});
     if(j.kind==='children'){page.postIds=state.context.postIds;for(const q of page.next)if(q.kind==='children'){q.url=j.url;q.scopeCode=scopedJob.scopeCode;}}
     if(j.kind==='inline'&&page.unavailable.some(x=>x.kind==='inline_unavailable')){const fact=state.context.facts.get(j.parentId);if(fact?.url){page.unavailable=page.unavailable.filter(x=>x.kind!=='inline_unavailable');page.next.push({kind:'children',parentId:j.parentId,cursor:null,url:fact.url});}}
     // Keep the failed page pending if parsing, identity or parent checks fail.
     ingest(state,page,target,key);state.queue.shift();state.visited.add(key);schedulePositiveChildren(state,target);
    }
    if(state.seenIds.size>=maxItems&&state.queue.length)state.budgetStopped=true;
    state.estimatedBytes=Buffer.byteLength(JSON.stringify(state.items))+state.seenIds.size*180;
    if(state.queue.length&&!options.streamComments)return attachReadState({...contentBase(target),status:'partial',reason:'COLLECTION_IN_PROGRESS',identityVerified:true,nativePostId:state.context.nativeId,items:[],count:0,phase:'collecting',coverage:metaCommentCoverage(state,target),pagination:{nextCursor:null,hasMore:true,complete:false,reason:'HTTP_PAGE_BUDGET'}},state);
    return deliver(state,target,null);
   }catch(e){return{...contentBase(target),status:'error',reason:/^(?:META_|NATIVE_|ANONYMOUS_QUERY)/.test(e.code||'')?e.code:httpFailure(e),retryAfterMs:e.retryAfterMs||null,items:[],count:0,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'NATIVE_READ_FAILED'}};}
  },binding);
  if(state){bindHttpState(state,binding);state.transport=value.transport;}if(!state||!state.queue.length)await binding.dispose?.();
  const result={...contentBase(target),...value};if(state&&(state.queue.length||state.items.length||state.context.unavailable.length)||nextState&&!['ok','partial','unavailable'].includes(result.status))attachReadState(result,state||nextState);return result;
 };
}
