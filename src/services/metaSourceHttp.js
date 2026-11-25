import {takeReadySourceItems} from './sourceReadyItems.js';
import {createHttpExecutor,httpFailure} from './socialHttpTransport.js';
import {metaBootstrap,requestMetaQuery} from './socialMetaRequests.js';
import {contentBase,extractContentSnapshot,walkContent,metaPost} from './socialContent.js';
import {snapshotPayloads,extractSocialMetrics} from './socialMetrics.js';
import {normalizeMetricsInput} from './socialMetrics.js';
import {extractPostInfo} from './socialPostInfo.js';
import {publicApiIssue,unavailableThreadsSourceQuote} from './socialApiErrors.js';
import {READ_STATE,attachReadState} from './socialReadState.js';
import {HTTP_BINDING,bindHttpState} from './socialLeaseState.js';
// Verified 2026-11-09 from Threads Bootloader module and a native cursor replay.
// BarcelonaProfileThreadsTabRefetchableDirectQuery_threadsRelayOperation
// The old 28493213377048182 operation requires flags absent in today's bootstrap.
export const THREADS_SOURCE_PAGINATION_QUERY={name:'BarcelonaProfileThreadsTabRefetchableDirectQuery',docId:'40155197760760366'};
export const THREADS_DUPLICATE_PAGE_LIMIT=3;
const fail=code=>{throw Object.assign(Error(code),{code});};
export function sourceConnection(snapshot,platform){
 const found=[];
 for(const root of snapshotPayloads(snapshot.html,snapshot.jsonResponses))walkContent(root,v=>{
  for(const c of platform==='threads'?[v.mediaData]:[v.xig_user_by_username?.polaris_ordered_timeline_connection,v.xdt_api__v1__feed__user_timeline_graphql_connection,v.user?.edge_owner_to_timeline_media])if(c?.edges&&c.page_info)found.push(c);
 });
 if(found.length!==1||!Array.isArray(found[0].edges)||typeof found[0].page_info.has_next_page!=='boolean')fail('META_SOURCE_CONNECTION_UNVERIFIED');return found[0];
}
export function sourceQuery(config,platform){
 const queries=config.queries.filter(q=>(platform==='threads'?/Profile.*(?:Timeline|Posts|ThreadsTab)|(?:Timeline|Posts).*Profile/:/Timeline|ProfilePosts|User.*Posts/).test(q.name)&&!/(?:Replies|Reposts|Liked|Highlights)/.test(q.name));
 const query=queries.find(q=>Object.hasOwn(q.variables,'after'))||queries[0];
 if(!query)fail('META_SOURCE_QUERY_MANIFEST_MISSING');
 if(platform==='threads'&&query.name==='BarcelonaProfileThreadsTabDirectQuery')return {...THREADS_SOURCE_PAGINATION_QUERY,variables:{...query.variables,before:null,last:null}};
 return query;
}
export function createMetaSourceHttpReader(options={}){
 const execute=createHttpExecutor(options);
 return async target=>{
  let state=target[READ_STATE]||null;const binding=state?.[HTTP_BINDING]||{};
  const value=await execute(target,async(session,_deadline,meta)=>{
   try{
    const deliver=async()=>{
     await options.restoreSourcePublicationDates?.(target,state.items);
     state.dateAttempts ||=new Set();let requests=0;
     if(options.streamSourceItems&&target.platform==='instagram'&&state.items.some(x=>!Number.isFinite(Date.parse(x.createdAt))&&(options.requireSourcePublicationTime||!state.dateAttempts.has(x.id)))){const items=takeReadySourceItems(state,state.items);if(items.length)return {...state.base,status:'partial',reason:'DATE_HYDRATION_IN_PROGRESS',phase:'collecting',items,count:items.length,nativePageCount:state.pending.nativePageCount,pagination:{hasMore:true,complete:false}};}
     if(target.platform==='instagram')for(const item of state.items.filter(x=>!Number.isFinite(Date.parse(x.createdAt))&&(options.requireSourcePublicationTime||!state.dateAttempts.has(x.id)))){
      if(requests>=(options.maxPages||8)||Date.now()>_deadline-1500)break;requests++;
      const postTarget=normalizeMetricsInput({url:item.url}),snapshot=await session.request(postTarget.url),info=extractPostInfo(postTarget,snapshot);
      if(['auth_required','security_checkpoint','rate_limited','error','proxy_error'].includes(info.status))return {...contentBase(target),status:info.status,reason:info.reason,retryAfterMs:snapshot.retryAfterMs||info.retryAfterMs};
      if(info.identityVerified&&info.post?.id===item.id){
       if(Number.isFinite(Date.parse(info.post.createdAt))){item.createdAt=new Date(info.post.createdAt).toISOString();item.dateEvidence='matched_post_detail';}
       const count=extractSocialMetrics(postTarget,snapshot).metrics?.comment;if(Number.isSafeInteger(count)&&count>=0)item.metrics={...item.metrics,comment:count};
      }
      if(options.requireSourcePublicationTime&&!Number.isFinite(Date.parse(item.createdAt)))return {...state.base,status:'error',reason:'SOURCE_POST_PUBLICATION_UNVERIFIED',items:[],count:0};
      state.dateAttempts.add(item.id);
     }
     if(target.platform==='instagram'&&state.items.some(x=>!Number.isFinite(Date.parse(x.createdAt))&&(options.requireSourcePublicationTime||!state.dateAttempts.has(x.id))))return {...state.base,status:'partial',reason:'DATE_HYDRATION_IN_PROGRESS',phase:'collecting',...(()=>{const items=options.streamSourceItems?takeReadySourceItems(state,state.items):[];return {items,count:items.length};})(),nativePageCount:state.pending.nativePageCount,pagination:{hasMore:true,complete:false}};
     const allRows=state.items,rows=options.streamSourceItems?takeReadySourceItems(state,allRows,{complete:true}):allRows,pending=state.pending;for(const item of allRows)state.seen.add(item.id);state.items=[];state.pending=null;state.context.visitedSourceCursors ||=new Set();if(state.nativeCursor)state.context.visitedSourceCursors.add(state.nativeCursor);state.nativeCursor=pending.nextCursor;
     return {...state.base,status:'ok',reason:null,phase:'delivering',items:rows,count:rows.length,nativePageCount:pending.nativePageCount,...(pending.duplicatePage?{paginationProgress:{duplicatePage:true,consecutiveDuplicatePages:state.context.duplicateSourcePages}}:{}),pagination:{hasMore:pending.hasMore,nextCursor:null,complete:!pending.hasMore}};
    };
    let snapshot;
    if(!binding.sourceConfig||meta?.sessionChanged||!state){
     snapshot=await session.request(target.url);const base=extractContentSnapshot(target,snapshot);
     if(!base.identityVerified&&snapshot.httpStatus===200&&!['auth_required','security_checkpoint','rate_limited','error'].includes(base.status)){
      const ids=new Set();for(const root of snapshotPayloads(snapshot.html,snapshot.jsonResponses))walkContent(root,v=>{const id=String(v.pk||v.id||'');if(v.username?.toLowerCase()===target.username.toLowerCase()&&/^\d+$/.test(id))ids.add(id);});
      if(ids.size===1&&ids.has(target.expectedNativeId)&&sourceConnection(snapshot,target.platform).edges.length===0)Object.assign(base,{status:'ok',reason:null,identityVerified:true,source:{id:target.expectedNativeId,username:target.username,url:target.url}});
     }
     if(!base.identityVerified||!['ok','partial'].includes(base.status))return base;
     if(target.expectedNativeId&&String(base.source?.id)!==target.expectedNativeId)fail('SOURCE_IDENTITY_CONFLICT');
     binding.sourceConfig=metaBootstrap(snapshot.html);
     if(!state){state={kind:'meta_source',nativeCursor:null,seen:new Set(),base:{...contentBase(target),source:base.source,identityVerified:true},context:{sourceId:base.source?.id}};}
    }
    if(state.pending)return deliver();
    let conn;
    if(state.nativeCursor){
     const query=sourceQuery(binding.sourceConfig,target.platform),variables={...query.variables,after:state.nativeCursor};
     const response=await requestMetaQuery(session,target,binding.sourceConfig,query,variables);
     if(response.httpStatus!==200)return{...contentBase(target),status:response.httpStatus===429?'rate_limited':'error',reason:'UPSTREAM_HTTP_'+response.httpStatus,retryAfterMs:response.retryAfterMs||null};
     const issue=publicApiIssue([response.html],target.platform==='threads'?{ignoreError:unavailableThreadsSourceQuote}:{});if(issue)return{...contentBase(target),...issue,retryAfterMs:response.retryAfterMs||issue.retryAfterMs||null};
     snapshot={html:'',jsonResponses:[response.html]};
    }
    conn=sourceConnection(snapshot,target.platform);
    const rows=[];let nativeRows=0,foreignRows=0,foreignIds=[],unverifiedEdge=false,verifiedRows=0;
    for(const edge of conn.edges){
     const native=target.platform==='threads'?(edge.node?.thread_items||[]).map(x=>x.post):[edge.node];
     if(!native.length||native.some(p=>!p))unverifiedEdge=true;
     for(const p of native.filter(Boolean)){
      nativeRows++;
      const item=metaPost(p,target.platform);if(!item)continue;
      // Instagram uses a web-scoped owner ID in some payloads; bind only the matched username.
      const username=p.user?.username||p.owner?.username;
      if(username?.toLowerCase()!==target.username.toLowerCase()){
       // A native repost can be intentionally excluded, but missing ownership
       // or a conflicting username for the same owner is not an empty page.
       if(typeof username==='string'&&username&&/^\d+$/.test(String(item.author?.id))&&String(item.author.id)!==String(state.context.sourceId)){foreignRows++;foreignIds.push(item.id);verifiedRows++;}
       continue;
      }
      if(target.platform==='instagram'&&state.context.sourceId)item.author.id=state.context.sourceId;
      if(String(item.author.id)!==String(state.context.sourceId))fail('SOURCE_IDENTITY_CONFLICT');
      verifiedRows++;
      if(!state.seen.has(item.id)&&!rows.some(x=>x.id===item.id))rows.push(item);
     }
    }
    const onlyVerifiedForeignRows=!unverifiedEdge&&nativeRows>0&&foreignRows===nativeRows&&foreignIds.some(id=>!state.context.excludedSourceIds?.has(id));
    const more=conn.page_info.has_next_page===true,next=conn.page_info.end_cursor;
    if(more&&(!next||next===state.nativeCursor||state.context.visitedSourceCursors?.has(next)))fail('NATIVE_PAGINATION_STALLED');
    const duplicatePage=conn.edges.length>0&&rows.length===0&&!onlyVerifiedForeignRows;
    if(duplicatePage){
     // Threads can overlap entire pages while advancing its native cursor.
     // Only fully parsed, ownership-verified pages qualify; malformed rows still fail.
     if(target.platform!=='threads'||unverifiedEdge||nativeRows===0||verifiedRows!==nativeRows)fail('NATIVE_PAGINATION_STALLED');
     const repeated=(state.context.duplicateSourcePages||0)+1;
     if(more&&repeated>THREADS_DUPLICATE_PAGE_LIMIT)fail('NATIVE_PAGINATION_STALLED');
     state.context.duplicateSourcePages=repeated;
    }else state.context.duplicateSourcePages=0;
    if(foreignIds.length){state.context.excludedSourceIds ||=new Set();for(const id of foreignIds)state.context.excludedSourceIds.add(id);}
    state.items=rows;state.pending={nextCursor:next||null,hasMore:more,nativePageCount:conn.edges.length,duplicatePage};
    return deliver();
   }catch(e){return{...contentBase(target),status:'error',reason:e.code||httpFailure(e)};}
  },binding);
  if(state)bindHttpState(state,binding);
  const result={...contentBase(target),...value};
  if(state&&(result.pagination?.hasMore!==false||!['ok','partial'].includes(result.status)))attachReadState(result,state);else await binding.dispose?.();
  return result;
 };
}
