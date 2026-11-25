import {snapshotPayloads,extractSocialMetrics,exactPublicCount} from './socialMetrics.js';
import {walkContent,metaPost,commentMeta} from './socialContent.js';
export const META_COMMENT_POLICY='native_meta_comment_pagination_v1';
// Threads operation IDs verified against public native JS on 2026-11-09; these are not credentials.
export const META_COMMENT_QUERIES=Object.freeze({threads:{name:'BarcelonaPostPageDirectRepliesRefetchQuery',docId:'28945680891766586'},threads_inline:{name:'BarcelonaInlineRepliesExpansionQuery',docId:'39682525988062139'},instagram:{name:'PolarisLoggedOutDesktopWWWPostCommentsPaginationQuery',docId:'27837656105907150'}});
const str=x=>typeof x==='string'||Number.isSafeInteger(x)?String(x):null;
const fail=code=>{throw Object.assign(Error(code),{code});};
export function metaBoundMedia(target,snapshot,boundIds=[]){
 const media=[];for(const root of snapshotPayloads(snapshot.html,snapshot.jsonResponses))walkContent(root,v=>{for(const m of [v.media,v.xig_polaris_media,v.shortcode_media])if(m&&typeof m==='object')media.push(m);});
 const ids=new Set(boundIds);for(const m of media)if((m.code||m.shortcode)===target.id)for(const id of [str(m.pk),str(m.id)].filter(Boolean))ids.add(id);
 if(!ids.size)fail('META_POST_IDENTITY_UNVERIFIED');let merged=null;
 for(const m of media)if([str(m.pk),str(m.id)].some(id=>id&&ids.has(id))){merged={...merged,...m,text_post_app_info:{...merged?.text_post_app_info,...m.text_post_app_info}};for(const id of [str(m.pk),str(m.id)].filter(Boolean))ids.add(id);}
 if(!merged)fail('META_PAGE_IDENTITY_UNVERIFIED');const nativeId=[str(merged.pk),str(merged.id),...ids].find(id=>/^\d+$/.test(id||''));if(!nativeId)fail('META_NATIVE_POST_ID_UNVERIFIED');if(boundIds.length&&!boundIds.includes(nativeId))fail('META_POST_IDENTITY_CHANGED');return{media:merged,postIds:[...ids],nativeId};
}
export function metaInitialCounter(target,snapshot){const r=extractSocialMetrics(target,snapshot),field=r.evidence?.comment,scope=target.platform==='threads'&&field==='matched_post.text_post_app_info.direct_reply_count'?'roots':target.platform==='instagram'&&field==='matched_post.comment_count'?'all':null;return{expected:r.identityVerified?exactPublicCount(r.metrics.comment):null,scope};}
export const metaQueueKey=j=>JSON.stringify([j.kind,j.parentId||null,j.cursor||null]);
export function parseMetaCommentPage(target,snapshot,{postIds=[],job=null,knownLevels=new Map()}={}){
 const items=[],next=[],unavailable=[],levels=new Map(knownLevels);let bound=null,sourceNativeId=job?.rootNativeId||null,levelOffset=0;
 const addConnection=(conn,kind,parentId=null)=>{if(typeof conn?.page_info?.has_next_page!=='boolean')fail('META_NATIVE_PAGINATION_UNVERIFIED');if(conn?.page_info?.has_next_page===true){if(typeof conn.page_info.end_cursor!=='string'||!conn.page_info.end_cursor)fail('META_NEXT_CURSOR_MISSING');next.push({kind,parentId,cursor:conn.page_info.end_cursor});}};
 const readPosts=(conn,parentId,baseLevel)=>{
  const stack=new Map([[baseLevel-1,parentId]]);let previous=parentId;
  for(const edge of conn?.edges||[]){const n=edge.node?.post||edge.node,p=metaPost(n||{},'threads');if(!p)continue;const info=n.text_post_app_info||{},rawLevel=Number.isSafeInteger(info.reply_level)?info.reply_level:Number.isSafeInteger(edge.node?.reply_level)?edge.node.reply_level:null,level=rawLevel===null?null:rawLevel+levelOffset;
   if(p.id===parentId){if(level!==null){stack.set(level,p.id);levels.set(p.id,level);}continue;}
   const explicit=str(info.reply_to_post_id)||str(info.replied_to_post?.pk)||str(info.replied_to_post?.id),parent=explicit||(level===null?previous:stack.get(level-1));if(!parent)fail('META_REPLY_PARENT_UNVERIFIED');
   items.push({...p,type:parent===(sourceNativeId||bound?.nativeId)?'comment':'reply',postId:target.id,parentId:parent===(sourceNativeId||bound?.nativeId)?null:parent,replyToPostId:parent,parentEvidence:explicit?'native_reply_to_post':level===null?'native_thread_posts_sequence':'native_reply_level_stack',nativeReplyLevel:level,likes:exactPublicCount(n.like_count),replyCount:exactPublicCount(info.direct_reply_count)});
   if(level!==null){for(const k of stack.keys())if(k>=level)stack.delete(k);stack.set(level,p.id);levels.set(p.id,level);}previous=p.id;
  }
  if(conn?.page_info?.has_next_page===true){const anchor=(conn.edges||[]).map(e=>e.node?.post||e.node).find(n=>str(n.pk||n.id)!==parentId);const id=str(anchor?.pk||anchor?.id)||parentId;if(id&&id!==bound?.nativeId)next.push({kind:'inline',parentId:id,cursor:null});else unavailable.push({kind:'thread_posts',parentId,cursor:conn.page_info.end_cursor||null});}
 };
 if(job?.kind==='inline'){
  const roots=snapshotPayloads('',snapshot.jsonResponses),data=roots.map(x=>x.data?.data||x.data?.xdt_text_feed__media_id__inline_replies).find(x=>x&&(x.inline_thread||x.inline_threads));if(!data){const nullAlias=roots.some(x=>x.data&&Object.hasOwn(x.data,'data')&&x.data.data===null);if(nullAlias)return{items:[],next:[],unavailable:[{kind:'inline_unavailable',parentId:job.parentId,cursor:job.cursor}],levels,postIds,nativeId:postIds.find(x=>/^\d+$/.test(x))};fail('META_INLINE_RESPONSE_UNVERIFIED');}bound={nativeId:postIds.find(x=>/^\d+$/.test(x)),postIds};
  for(const thread of [data.inline_thread,...(data.inline_threads||[])].filter(Boolean)){
   const edges=(thread.thread_items||[]).map(i=>({node:{...i.post,text_post_app_info:{...i.post?.text_post_app_info,...(Number.isSafeInteger(i.reply_level)?{reply_level:i.reply_level}:{})}}}));
   readPosts({edges},job.parentId,(levels.get(job.parentId)??0)+1);
  }
  if(data.paging_token)next.push({kind:'inline',parentId:job.parentId,cursor:String(data.paging_token)});
 }else{
  bound=metaBoundMedia(job?.kind==='children'?{...target,id:job.scopeCode}:target,snapshot,postIds);const m=bound.media;
  if(target.platform==='instagram'){
   const conn=m.comments_connection||m.edge_media_to_parent_comment||m.edge_media_to_comment;if(!conn)fail('META_COMMENT_CONNECTION_UNVERIFIED');addConnection(conn,'roots');
   for(const edge of conn.edges||[]){const n=edge.node,c=commentMeta(n,target);if(c)items.push(c);for(const child of n.edge_threaded_comments?.edges||[]){const reply=commentMeta(child.node,target,c?.id);if(reply)items.push(reply);}if(n.edge_threaded_comments?.page_info?.has_next_page)unavailable.push({kind:'instagram_replies',parentId:c?.id,cursor:n.edge_threaded_comments.page_info.end_cursor||null});}
  }else{
   const info=m.text_post_app_info||{},conn=info.direct_replies;if(!conn)fail('META_COMMENT_CONNECTION_UNVERIFIED');addConnection(conn,job?.kind==='children'?'children':'roots',job?.kind==='children'?job.parentId:null);
   const firstLevels=(conn.edges||[]).map(e=>(e.node?.posts?.edges||[]).map(x=>x.node?.text_post_app_info?.reply_level).find(Number.isSafeInteger)).filter(Number.isSafeInteger),nativeBase=Number.isSafeInteger(info.reply_level)?info.reply_level:firstLevels.length?Math.min(...firstLevels)-1:0;
   if(job?.kind==='children')levelOffset=(levels.get(job.parentId)??nativeBase)-nativeBase;
   const base=nativeBase+levelOffset+1;
   for(const connection of [conn,info.pinned_replies])for(const edge of connection?.edges||[])readPosts(edge.node?.posts,bound.nativeId,base);
   if(info.self_thread?.posts)readPosts(info.self_thread.posts,bound.nativeId,base);
  }
 }
 if(job?.kind==='children')for(const q of next)if(q.kind==='children'){q.url=job.url;q.scopeCode=job.scopeCode;}
 return{items:[...new Map(items.map(x=>[x.id,x])).values()],next,unavailable,levels,postIds:bound.postIds,nativeId:bound.nativeId};
}
export function metaCommentCoverage(state,target){
 const facts=state.context.facts,roots=[...facts.values()].filter(x=>x.type==='comment'),ids=new Set(facts.keys()),children=new Map();let orphan=0;
 for(const x of facts.values())if(x.type==='reply'){if(!x.parentId||!ids.has(x.parentId))orphan++;else children.set(x.parentId,(children.get(x.parentId)||0)+1);}
 let unknown=0,mismatch=0;for(const x of facts.values()){const n=exactPublicCount(x.replyCount);if(n===null)unknown++;else if(n!==(children.get(x.id)||0)&&target.includeReplies)mismatch++;}
 const expected=state.expected,scope=state.context.countScope,countVerified=Number.isSafeInteger(expected)&&expected>=0&&expected===(scope==='all'?ids.size:scope==='roots'?roots.length:-1),exhausted=state.queue.length===0&&!state.context.unavailable.length&&!state.paginationStalled&&!state.budgetStopped;
 // Instagram's native all-comment total can prove null per-root reply counts without replacing them by zero.
 const repliesVerified=orphan===0&&mismatch===0&&(unknown===0||target.platform==='instagram'&&scope==='all'&&countVerified);
 const complete=exhausted&&countVerified&&repliesVerified;
 return{version:4,policy:META_COMMENT_POLICY,scope:'anonymous_public_response',countScope:scope,expectedPublicCount:expected,observedUnique:ids.size,observedRootComments:roots.length,observedReplies:ids.size-roots.length,countVerified,replyCountsVerified:repliesVerified,unknownReplyCounts:unknown,replyCountMismatches:mismatch,orphanReplies:orphan,exhausted,publicPaginationComplete:exhausted,complete,evidence:complete?'native_meta_cursors_counts_and_parent_links_verified':null,reason:state.paginationStalled?'NATIVE_PAGINATION_STALLED':state.context.unavailable.length?'NATIVE_REPLY_PAGINATION_UNAVAILABLE':!exhausted?'CONTINUATION_PENDING':!countVerified?'PUBLIC_COMMENT_COUNT_MISMATCH':!repliesVerified?'PUBLIC_REPLY_COUNT_MISMATCH':null};
}
