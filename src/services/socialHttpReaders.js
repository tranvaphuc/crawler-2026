import {publicApiIssue} from './socialApiErrors.js';
import {takeReadySourceItems} from './sourceReadyItems.js';
import {createMetaSourceHttpReader} from './metaSourceHttp.js';
import {createMetaCommentHttpReader} from './metaCommentHttp.js';
import {observeYoutubeCommentItems,youtubeCommentCoverage} from './youtubeCommentCoverage.js';
import {createTiktokInteractionReader} from './tiktokInteraction.js';
import {applyYoutubeCommentDate} from './youtubeCommentDates.js';
import {publicationTextTime,applySourcePublicationText} from './socialPublicationTime.js';
import {HTTP_BINDING,bindHttpState} from './socialLeaseState.js';
import {READ_STATE,attachReadState,cacheTransport} from './socialReadState.js';
import {youtubeSourceSort,exactSort,describeMetaWindow,youtubeCommentSortSelection}from './socialOrdering.js';
import {readOnlyHtml} from './socialHtmlSnapshot.js';
import {httpFailure,createHttpExecutor} from './socialHttpTransport.js';
import {extractSocialMetrics,metricsFailure,readOnlyAssignedJson as assignedJson,snapshotPayloads,exactPublicCount} from './socialMetrics.js';
import {extractContentSnapshot,contentBase,walkContent,walkContentValues,hasYoutubeCommentNodes} from './socialContent.js';
import {extractPostInfo} from './socialPostInfo.js';
import {youtubeJsonPostMetadata} from './youtubeJsonMetadata.js';
import {createYoutubeSourceBootstrap,youtubeChannelRestriction} from './youtubeSourceBootstrap.js';
import {normalizeMetricsInput} from './socialMetrics.js';
const nativeText=v=>typeof v==='string'?v:v?.simpleText||v?.runs?.map(x=>x.text||'').join('')||v?.content||'';
function gate(snapshot,platform){const title=readOnlyHtml(snapshot.html||'',{platform})('title').text();return {securityBlocked:/^(?:security check|just a moment|verify you are human|challenge)/i.test(title)};}
function roots(snapshot){return [...snapshotPayloads(snapshot.html,snapshot.jsonResponses,{platform:'youtube'}),assignedJson(snapshot.html||'','ytInitialData'),assignedJson(snapshot.html||'','ytInitialPlayerResponse')].filter(Boolean);}
// One bootstrap walk discovers the comment menu and its native sections.
// Scope filtering still happens in addScope below. The cache belongs to this
// exact snapshot and is invalidated if any HTML/network input changes.
const commentBootstrapScans=new WeakMap();
const sourceSortLabel=x=>typeof x==='string'?x:x?.simpleText||x?.content||x?.runs?.map(r=>r.text||'').join('')||'';
function commentBootstrapScan(snapshot){
 const network=snapshot.jsonResponses||[],previous=commentBootstrapScans.get(snapshot);
 if(previous&&previous.html===snapshot.html&&previous.network.length===network.length&&previous.network.every((v,i)=>v===network[i]))return previous.scan;
 const initial=assignedJson(snapshot.html||'','ytInitialData'),all=[...snapshotPayloads(snapshot.html,network,{platform:'youtube'}),initial,assignedJson(snapshot.html||'','ytInitialPlayerResponse')].filter(Boolean);
 const scan={newest:null,regular:null,panel:null,sourceLatest:false};
 for(const root of all)walkContentValues(root,v=>{
  if(root===initial){
   for(const item of v.sortFilterSubMenuRenderer?.subMenuItems||[])if(/^(?:newest|newest first)$/i.test(item.title||'')){
    const token=item.serviceEndpoint?.continuationCommand?.token;
    if(token)scan.newest={token,api:'/youtubei/v1/next',reply:false,kind:'root',requestedOrder:'latest',evidence:'native_comment_sort_menu.Newest'};
   }
   // Preserve the internal checkpoint flag without a separate source-sort walk.
   const chip=v.chipCloudChipRenderer,model=v.chipViewModel;
   if(chip&&(chip.isSelected||chip.selected)&&/^(?:latest|newest|most recent)$/i.test(sourceSortLabel(chip.text)))scan.sourceLatest=true;
   if(model&&(model.isSelected||model.selected||model.isActive)&&/^(?:latest|newest)$/i.test(sourceSortLabel(model.text)))scan.sourceLatest=true;
  }
  const section=v.itemSectionRenderer;
  if(section&&/comment/.test(section.targetId||section.sectionIdentifier||'')&&!scan.regular)scan.regular=section;
  if(/comment/.test(v.engagementPanelSectionListRenderer?.panelIdentifier||'')&&!scan.panel)scan.panel=v.engagementPanelSectionListRenderer.content;
 });
 commentBootstrapScans.set(snapshot,{html:snapshot.html,network:[...network],scan});return scan;
}
/** Source and sort verification from the same native payloads previously inspected in Chrome. */
export function youtubeHttpUi(target,snapshot,knownRootIds=new Set()){
 const all=roots(snapshot),initial=all.find(x=>x.metadata?.channelMetadataRenderer),meta=initial?.metadata.channelMetadataRenderer;
 const ui={...gate(snapshot,'youtube'),commentItems:[],sourceVerified:false,searchKeyword:null,latestVerified:false};
 if(target.operation==='source'&&meta){
  const expected=target.sourcePath;
  const urls=[snapshot.finalUrl,...(meta.ownerUrls||[]),meta.vanityChannelUrl,meta.channelUrl].filter(Boolean);
  ui.sourceVerified=!!meta.externalId&&urls.some(raw=>{try{const path=new URL(raw).pathname.replace(/\/videos\/?$/,'');return expected.startsWith('/channel/')?path===expected:path.toLowerCase()===expected.toLowerCase();}catch{return false;}});
  ui.source={id:meta.externalId||null,name:meta.title||null,url:target.url};
  const selected=initial.contents?.twoColumnBrowseResultsRenderer?.tabs?.map(x=>x.tabRenderer).find(x=>x?.selected&&/videos/i.test(x.title||'')),targetId=selected?.content?.richGridRenderer?.targetId;
  // This native grid identity is part of the checkpoint, never a global scope.
  if(ui.sourceVerified&&(!target.expectedNativeId||target.expectedNativeId===meta.externalId)&&typeof targetId==='string'&&targetId.length>0&&targetId.length<=128)ui.sourceContinuationTarget={sourceId:meta.externalId,targetId};
 }
 if(target.operation==='search'){
  try{ui.searchKeyword=new URL(snapshot.finalUrl).searchParams.get('search_query');}catch{}
  for(const root of all)walkContentValues(root,v=>{
   const f=v.searchFilterRenderer,label=nativeText(f?.label);
   if(f&&/^(?:upload date|date uploaded)$/i.test(label)&&/SELECTED$/.test(f.status||'')&&!/UNSELECTED|DISABLED/.test(f.status)){ui.latestVerified=true;ui.latestEvidence='native_searchFilterRenderer.Upload date.SELECTED';}
   const expectedLabel={today:'Today',week:'This week',month:'This month',year:'This year'}[target.uploadDate];
   if(f&&expectedLabel&&label.toLowerCase()===expectedLabel.toLowerCase()&&f.status==='FILTER_STATUS_SELECTED'){ui.uploadDateVerified=true;ui.uploadDateEvidence='native_searchFilterRenderer.'+expectedLabel+'.SELECTED';}
   for(const item of v.sortFilterSubMenuRenderer?.subMenuItems||[])if(item.selected&&/upload date|newest|most recent/i.test(item.title||'')){ui.latestVerified=true;ui.latestEvidence='native_selected_sort_menu.Upload date';}
  });
 }
 if(target.operation==='comments'){
  const valid=all.some(x=>x.videoDetails?.videoId===target.id);if(!valid)return ui;
  const byId=new Map();
  for(const root of all)if(hasYoutubeCommentNodes(root))walkContent(root,(v,path)=>{
   if(/secondaryResults|secondaryContents/.test(path))return false;
   const c=v.commentRenderer;
   if(c?.commentId)byId.set(c.commentId,{id:c.commentId,postId:target.id,url:`https://www.youtube.com/watch?v=${target.id}&lc=${encodeURIComponent(c.commentId)}`,type:'comment',parentId:null,platform:'youtube',text:nativeText(c.contentText),author:{id:c.authorEndpoint?.browseEndpoint?.browseId||null,name:nativeText(c.authorText)||null,username:null},createdAt:null,publishedText:nativeText(c.publishedTimeText)||null,likes:exactPublicCount(nativeText(c.voteCount).replace(/,/g,'')),replyCount:exactPublicCount(c.replyCount)});
   const e=v.commentEntityPayload,p=e?.properties;
   if(!p?.commentId)return;
   byId.set(p.commentId,{id:p.commentId,postId:target.id,url:`https://www.youtube.com/watch?v=${target.id}&lc=${encodeURIComponent(p.commentId)}`,platform:'youtube',type:p.replyLevel>0?'reply':'comment',parentId:null,text:nativeText(p.content),author:{id:e.author?.channelId||null,name:e.author?.displayName||null,username:e.author?.displayName?.startsWith('@')?e.author.displayName.slice(1):null},createdAt:null,publishedText:p.publishedTime||null,likes:exactPublicCount(e.toolbar?.likeCountNotliked),replyCount:exactPublicCount(e.toolbar?.replyCount)});
  });
  for(const item of byId.values()){
   const parent=item.id.includes('.')?item.id.split('.')[0]:null;
   if(item.type==='reply'||parent){if(!parent||!byId.has(parent)&&!knownRootIds.has(parent))continue;item.type='reply';item.parentId=parent;item.parentEvidence='native_comment_id_prefix';}
   ui.commentItems.push(item);
  }
 }
 return ui;
}
export function youtubeContinuations(snapshot,target,{response=null,reply=false}={}){
 const queue=[];
 // The response branch already has parsed native JSON. Bootstrap roots are
 // needed only by the bootstrap branches below.
 let initial;
 const addScope=(scope,defaultReply=false)=>walkContent(scope,(v,path)=>{
  if(/secondaryResults|secondaryContents|adSlot|promoted|shelfRenderer|reelShelfRenderer|richShelfRenderer/.test(path))return false;
  const continuation=v.continuationItemRenderer;
  const command=continuation?.continuationEndpoint||continuation?.button?.buttonRenderer?.command;
  const token=command?.continuationCommand?.token;
  const api=command?.commandMetadata?.webCommandMetadata?.apiUrl;
  if(token&&typeof token==='string')queue.push({token,api:/\/youtubei\/v1\/(next|browse|search)$/.test(api||'')?api:target.operation==='source'?'/youtubei/v1/browse':target.operation==='search'?'/youtubei/v1/search':'/youtubei/v1/next',reply:defaultReply||/replies/i.test(path)});
 });
 if(response){for(const action of [...(response.onResponseReceivedEndpoints||[]),...(response.onResponseReceivedActions||[]),...(response.onResponseReceivedCommands||[])]){const c=action.appendContinuationItemsAction||action.reloadContinuationItemsCommand;if(c)addScope(c.continuationItems,reply||/replies/i.test(c.targetId||''));}}
 else if(target.operation==='source'){
  initial=assignedJson(snapshot.html||'','ytInitialData');
  const tab=initial?.contents?.twoColumnBrowseResultsRenderer?.tabs?.map(x=>x.tabRenderer).find(x=>x?.selected&&/videos/i.test(x.title||''));if(tab)addScope(tab.content);
 }else if(target.operation==='search'){initial=assignedJson(snapshot.html||'','ytInitialData');addScope(initial?.contents?.twoColumnSearchResultsRenderer?.primaryContents);}
 else {const {regular,panel}=commentBootstrapScan(snapshot);addScope(regular||panel);}
 return [...new Map(queue.filter(x=>target.includeReplies||!x.reply).map(x=>[x.token,x])).values()];
}
function ytContext(html){
 // ytcfg.set is a JSON object in the anonymous bootstrap, not a saved browser session.
 const cfg=assignedJson(html.replace(/ytcfg\.set\(/g,'ytcfgHttpConfig = '),'ytcfgHttpConfig')||{};
 return cfg.INNERTUBE_CONTEXT || null;
}
const terminal=new Set(['error','auth_required','security_checkpoint','rate_limited','sort_unavailable']);
function trimResult(result,target){
 let items=result.items||[];
 if(target.operation==='comments'&&target.includeReplies){const roots=items.filter(x=>x.type==='comment'),rest=items.filter(x=>x.type!=='comment');items=[...roots.flatMap(root=>[root,...rest.filter(x=>x.parentId===root.id)]),...rest.filter(x=>!roots.some(r=>r.id===x.parentId))];}
 result.items=items.slice(0,target.limit);result.count=result.items.length;
 result.rootComments=result.items.filter(x=>x.type==='comment').length;result.replies=result.items.filter(x=>x.type==='reply').length;return result;
}
export function createSocialHttpMetricsReader(options={}){
 const execute=createHttpExecutor(options),tiktok=createTiktokInteractionReader(options.tiktok||{});
 return async target=>{
  if(target.platform==='tiktok')return tiktok(target);
  const value=await execute({...target,apiOperation:target.apiOperation||'metrics'},async session=>{const snapshot=await session.request(target.url);const ui=gate(snapshot,target.platform);
   if(ui.securityBlocked)return metricsFailure(target,'security_checkpoint','SECURITY_CHALLENGE');
   let result=extractSocialMetrics(target,snapshot);
   // The watch bootstrap can contain only the placeholder "Comments" header.
   // Fetch its native header once to verify the count, without starting a crawl.
   if(target.platform==='youtube'&&result.identityVerified&&result.metrics.comment===null&&snapshot.httpStatus===200){
    const context=ytContext(snapshot.html),next=youtubeContinuations(snapshot,{...target,operation:'comments',includeReplies:false})[0];
    if(context&&next){
     const response=await session.request('https://www.youtube.com'+next.api,{method:'POST',headers:{'content-type':'application/json',origin:'https://www.youtube.com',referer:target.url,accept:'application/json'},body:{context,continuation:next.token}});
     if(response.httpStatus!==200){result={...result,status:response.httpStatus===429?'rate_limited':[401,403].includes(response.httpStatus)?'auth_required':'error',reason:'UPSTREAM_HTTP_'+response.httpStatus,retryAfterMs:response.retryAfterMs,upstreamHttpStatus:response.httpStatus};}
     else {
      let payload,invalid=false;try{payload=JSON.parse(response.html);}catch{invalid=true;}
      const issue=publicApiIssue([response.html]);
      if(issue)result={...result,...issue,retryAfterMs:response.retryAfterMs||null,upstreamHttpStatus:response.httpStatus};
      else if(invalid||!payload||typeof payload!=='object'||Array.isArray(payload))result={...result,status:'error',reason:invalid?'UPSTREAM_INVALID_JSON':'UPSTREAM_API_RESPONSE_UNVERIFIED',upstreamHttpStatus:response.httpStatus};
      else result=extractSocialMetrics(target,{...snapshot,jsonResponses:[...(snapshot.jsonResponses||[]),response.html]});
     }
    }
   }
   if(snapshot.retryAfterMs&&!result.retryAfterMs)result.retryAfterMs=snapshot.retryAfterMs;return result;});
  return {...metricsFailure(target,value.status,value.reason),...value};
 };
}
/** Stateful HTTP pagination. Returned Symbols are consumed only by the router cursor store. */
export function createSocialHttpContentReader(options={}){
 const youtubeBootstrap=options.preferYoutubeJsonSourceBootstrap?createYoutubeSourceBootstrap():null;
 const metaComments=createMetaCommentHttpReader(options),metaSources=options.nativeSourcePages?createMetaSourceHttpReader(options):null;
 const execute=createHttpExecutor({...options,timeoutMs:options.timeoutMs||60000}),maxPages=options.maxPages||8;
 const maxItems=options.maxItems||20000;
 const pageSize=(state,target)=>Math.min(target.limit,typeof target.requestedCount==='number'?Math.max(0,target.requestedCount-(state.policyReturned||0)):target.limit);
 const dateCandidates=(state,target)=>{if(target.operation==='source'&&target.platform==='youtube'){state.dateObservedAt ||=new Date().toISOString();for(const item of state.items.slice(state.offset,state.offset+pageSize(state,target)))applySourcePublicationText(item,state.dateObservedAt);}return target.operation==='source'&&['instagram','youtube'].includes(target.platform)?state.items.slice(state.offset,state.offset+pageSize(state,target)).filter(x=>!x.createdAt&&(options.requireSourcePublicationTime||!state.dateAttempts?.has(x.id))):[];};
 async function sourcePage(state,target,session,deadline){
  await options.restoreSourcePublicationDates?.(target,state.items);
  state.dateAttempts ||= new Set();let requests=0,failure=null;
  for(const item of dateCandidates(state,target)){
   if(requests>=maxPages||Date.now()>deadline-1500)break;
   requests++;
   const postTarget=normalizeMetricsInput({url:item.url});
   let snapshot;
   if(options.preferYoutubePlayerMetadata&&target.platform==='youtube'&&state.context&&!state.playerMetadataUnsupported){
    const native=await youtubeJsonPostMetadata(session,postTarget,state.context,{sourceId:target.expectedNativeId});
    if(native.failure){failure=native.failure;break;}
    snapshot=native.snapshot;
    if(native.unsupported&&native.reason==='YOUTUBE_PLAYER_JSON_UNAVAILABLE')state.playerMetadataUnsupported=true;
    options.onNativeJsonRequest?.({platform:'youtube',operation:'post_metadata',mode:snapshot?'json':'html_fallback',reason:native.reason||null});
   }
   snapshot ||=await session.request(postTarget.url);const info=extractPostInfo(postTarget,snapshot);
   if(['auth_required','security_checkpoint','rate_limited','error'].includes(info.status)){failure=info;break;}
   if(info.identityVerified&&info.post?.id===item.id&&Number.isFinite(Date.parse(info.post.createdAt))){
    state.dateAttempts.add(item.id);
    item.createdAt=new Date(info.post.createdAt).toISOString();item.dateEvidence=info.post.dateEvidence||'matched_post_detail';item.datePrecision=info.post.datePrecision||'second';item.dateIsEstimated=info.post.dateIsEstimated||false;for(const [key,value]of Object.entries(info.metrics||{}))if(value!==null&&value!==undefined)item.metrics={...item.metrics,[key]:value};
   }else if(target.platform==='youtube'&&publicationTextTime(item.publishedText,state.dateObservedAt)){
    const date=publicationTextTime(item.publishedText,state.dateObservedAt);Object.assign(item,date,{dateEvidence:date.evidence});state.dateAttempts.add(item.id);
   }else if(options.requireSourcePublicationTime){failure={status:'error',reason:'SOURCE_POST_PUBLICATION_UNVERIFIED'};break;}
   else{state.dateAttempts.add(item.id);item.dateUnavailableReason=info.reason||'EXACT_POST_DATE_NOT_RETURNED';}
  }
  state.dateHydrationPending=dateCandidates(state,target).length>0;
  return {pending:state.dateHydrationPending,failure};
 }
 function deliver(state,target,transport){
  const limit=pageSize(state,target);let rows=state.items.slice(state.offset,state.offset+limit);state.offset+=rows.length;
  if(target.operation==='comments'&&target.platform==='youtube')for(const item of rows)applyYoutubeCommentDate(item,state.dateObservedAt??Date.now());
  const dates=target.operation==='source'?exactSort(rows,'latest'):null;if(dates?.verified)rows=dates.items;
  const remaining=state.offset<state.items.length,more=remaining||state.streamMore===true;
  const result={...state.base,items:rows,count:rows.length,rootComments:rows.filter(x=>x.type==='comment').length,replies:rows.filter(x=>x.type==='reply').length,phase:'delivering',stagedCount:state.items.length,
   pagination:{...state.base.pagination,nextCursor:null,hasMore:more?true:state.base.pagination.hasMore,complete:!more&&state.base.coverage?.complete===true,reason:remaining?'BUFFERED_ITEMS':state.base.pagination.reason},transport};
  if(dates){result.ordering={...result.ordering,missingTimestamps:dates.missing,...(dates.verified?{verified:true,scope:state.nativeLatest?'server':'returned_page',evidence:state.nativeLatest?'native_Latest_selection':'exact_createdAt_sort'}:{})};if(dates.verified&&['LATEST_SOURCE_ORDER_UNVERIFIED','SOURCE_DATES_UNAVAILABLE'].includes(result.reason))result.reason=null;}
  if(more){if(!remaining&&state.streamMore){state.items=[];state.offset=0;state.collecting=true;state.streamMore=false;}return attachReadState(result,state);}
  return result;
 }
 function finishOrdering(state,target){
  let ordered=state.items;
  if(target.operation==='comments'&&target.order==='oldest'){
   const exact=exactSort(ordered,'oldest');
   if(exact.verified){ordered=exact.items;state.base.ordering={requested:'oldest',verified:true,scope:'collected_public_items',evidence:'exact_createdAt_sort'};}
   else {
    const roots=ordered.filter(x=>x.type==='comment');if(state.nativeNewest)roots.reverse();
    const replies=ordered.filter(x=>x.type==='reply');ordered=roots.flatMap(root=>[root,...exactSort(replies.filter(x=>x.parentId===root.id),'oldest').items]);
    const orphan=replies.filter(x=>!roots.some(r=>r.id===x.parentId));ordered.push(...orphan);
    state.base.ordering={requested:'oldest',verified:state.nativeNewestConfirmed&&state.base.coverage.exhausted&&replies.length===0,scope:'threads',rootOrderVerified:state.nativeNewestConfirmed&&state.base.coverage.exhausted,replyOrderVerified:replies.length===0,evidence:state.nativeNewestConfirmed?'complete_Newest_root_sequence_reversed':null,missingTimestamps:exact.missing,reason:replies.length?'REPLY_OLDEST_SORT_UNVERIFIED':state.nativeNewestConfirmed?null:'OLDEST_SORT_UNAVAILABLE'};
   }
  }else if(target.operation==='source'){
   const sorted=exactSort(ordered,'latest');if(sorted.verified)ordered=sorted.items;
   state.base.ordering={requested:target.order,verified:state.nativeLatest||sorted.verified,scope:state.nativeLatest?'server':'available_window',serverFilterVerified:state.nativeLatest,evidence:state.nativeLatest?'native_Latest_selection':sorted.verified?'exact_createdAt_sort':null,missingTimestamps:sorted.missing};
  }
  state.items=ordered;state.collecting=false;state.offset=0;
  if(target.operation==='source'&&target.order==='latest'&&!state.base.ordering.verified)state.base.reason='LATEST_SOURCE_ORDER_UNVERIFIED';
  if(target.operation==='comments'&&target.order==='oldest'&&!state.base.ordering.verified)state.base.reason='OLDEST_SORT_PARTIALLY_UNVERIFIED';
 }
 return async target=>{
  if(target.operation==='source'&&metaSources&&['threads','instagram'].includes(target.platform))return metaSources(target);
  if(target.operation==='comments'&&['threads','instagram'].includes(target.platform))return metaComments(target);
  let state=target[READ_STATE]||null;
  if(state&&!state.collecting&&!dateCandidates(state,target).length)return deliver(state,target,cacheTransport(state.originTransport));
  let nextState=null,acceptWork=true;const binding=state?.[HTTP_BINDING]||{};
  const value=await execute(target,async(session,deadline,meta)=>{
   const sourceDelivery=async()=>{
    nextState=state;
    if(options.streamSourceItems&&dateCandidates(state,target).length){const items=takeReadySourceItems(state,state.items.slice(state.offset,state.offset+pageSize(state,target)));if(items.length)return {...state.base,status:'partial',reason:'DATE_HYDRATION_IN_PROGRESS',phase:'collecting',items,count:items.length,nativePageCount:state.items.length,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'METADATA_PENDING'}};}
    const {pending,failure}=await sourcePage(state,target,session,deadline);
    if(failure)return{...state.base,status:failure.status,reason:failure.reason,retryAfterMs:failure.retryAfterMs,items:[],count:0,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'DATE_LOOKUP_FAILED'}};
    if(pending)return{...state.base,status:'partial',reason:'DATE_HYDRATION_IN_PROGRESS',phase:'collecting',...(()=>{const items=options.streamSourceItems?takeReadySourceItems(state,state.items.slice(state.offset,state.offset+pageSize(state,target))):[];return {items,count:items.length};})(),nativePageCount:state.items.length,rootComments:0,replies:0,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'HTTP_PAGE_BUDGET'}};
    const result=deliver(state,target,null);if(options.streamSourceItems){result.nativePageCount=result.items.length;result.items=takeReadySourceItems(state,result.items,{complete:true});result.count=result.items.length;}nextState=result[READ_STATE]||null;return result;
   };
   if(meta?.sessionChanged&&state&&(state.collecting||state.streamMore)){const fresh=await session.request(target.url);if(fresh.httpStatus!==200||/\/(login|checkpoint|challenge)(?:\/|[?]|$)/.test(fresh.finalUrl||''))return extractContentSnapshot(target,fresh,gate(fresh,target.platform));const context=ytContext(fresh.html);if(!context)return{...contentBase(target),status:'error',reason:'NATIVE_CONTEXT_UNAVAILABLE'};state.context=context;state.recoveries=(state.recoveries||0)+1;}
   if(state&&!state.collecting)return sourceDelivery();
   if(!state){
    const bootstrapStarted=Date.now(),sourceNative=await youtubeBootstrap?.read(session,target);
    if(sourceNative)options.onNativeJsonRequest?.({platform:'youtube',operation:'source_bootstrap',mode:'json',reason:sourceNative.failure?.reason||sourceNative.reason||null,elapsedMs:Date.now()-bootstrapStarted});
    if(sourceNative?.failure)return{...contentBase(target),...sourceNative.failure};
    const htmlStarted=Date.now(),raw=sourceNative?.snapshot||await session.request(target.url);
    if(!sourceNative?.snapshot&&youtubeBootstrap){youtubeBootstrap.observe(target,raw);if(target.platform==='youtube'&&target.operation==='source')options.onNativeJsonRequest?.({platform:'youtube',operation:'source_bootstrap',mode:sourceNative?'html_fallback':'html_bootstrap',reason:sourceNative?.reason||null,elapsedMs:Date.now()-htmlStarted});}
    const snapshot={...raw,jsonResponses:[],observedAt:new Date().toISOString()};
    if(!acceptWork)return {...contentBase(target),status:'error',reason:'UPSTREAM_TIMEOUT'};
    if(snapshot.httpStatus===200&&target.platform==='youtube'&&target.operation==='source'){const restriction=youtubeChannelRestriction(assignedJson(snapshot.html||'','ytInitialData'),target.expectedNativeId);if(restriction)return {...contentBase(target),...restriction};}
    // Reuse this read's bootstrap evidence, while extraction owns independent
    // comment objects: it hydrates dates and other fields on returned items.
    const bootstrapUi=target.platform==='youtube'&&target.operation==='comments'?youtubeHttpUi(target,snapshot):null;
    let result=extractContentSnapshot(target,snapshot,bootstrapUi?structuredClone(bootstrapUi):target.platform==='youtube'?youtubeHttpUi(target,snapshot):gate(snapshot,target.platform));
    if(snapshot.retryAfterMs)result.retryAfterMs=snapshot.retryAfterMs;
    if(terminal.has(result.status)||snapshot.httpStatus>=400)return result;
    if(target.platform!=='youtube'){
     if(target.operation!=='search')result=describeMetaWindow(target,snapshot,result);
     else result.coverage={scope:'anonymous_public_response',complete:false,exhausted:result.pagination.hasMore===false,observedUnique:result.items.length};
     if(target.operation==='source'&&target.order==='latest'&&!result.ordering.verified)result.reason='LATEST_SOURCE_ORDER_UNVERIFIED';
     if(target.operation==='comments'&&!result.coverage.complete&&!result.coverage.unfilteredVerified)result.reason='FULL_COMMENT_MODE_UNVERIFIED';
     state={kind:'buffer',items:result.items,offset:0,base:result,collecting:false};
     if(!result.pagination.complete&&result.pagination.hasMore!==false)state.base.pagination.reason='NATIVE_PAGINATION_UNAVAILABLE';
     nextState=state.items.length>target.limit?state:null;
     if(target.operation==='source')return sourceDelivery();
     return deliver(state,target,null);
    }
    const native=target.operation==='comments'&&target.order==='oldest'?commentBootstrapScan(snapshot).newest:null;
    const expected=target.operation==='comments'?extractSocialMetrics(target,snapshot).metrics.comment:null;
    const headerQueue=native&&expected===null?youtubeContinuations(snapshot,target).filter(x=>x.token!==native.token).slice(0,1).map(x=>({...x,metadataOnly:true})):[];
    const queue=native?[...headerQueue,native]:youtubeContinuations(snapshot,target);
    const initial=target.operation==='comments'?null:assignedJson(snapshot.html,'ytInitialData');
    const minInitial=target.operation==='comments'?{}:target.operation==='search'?{contents:{twoColumnSearchResultsRenderer:{primaryContents:{}}}}:{metadata:initial?.metadata,contents:{twoColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,title:'Videos',content:{}}}]}}};
    const minHtml='<script>var ytInitialData = '+JSON.stringify(minInitial).replace(/</g,'\\u003c')+';var ytInitialPlayerResponse = '+JSON.stringify({videoDetails:{videoId:target.id}}).replace(/</g,'\\u003c')+';</script>';
    state={kind:'youtube',items:target.operation==='comments'&&native?[]:result.items,offset:0,base:result,collecting:true,queue,visited:new Set(),context:ytContext(snapshot.html),bootstrap:minHtml,dateObservedAt:snapshot.observedAt,
      ui:bootstrapUi||youtubeHttpUi(target,snapshot),nativeNewest:!!native,nativeNewestConfirmed:false,nativeLatest:target.operation==='comments'?commentBootstrapScan(snapshot).sourceLatest:youtubeSourceSort(snapshot),expected,commentHeaderAttempted:true,totalRequests:0};
    if(target.operation==='comments')state.ui.commentItems=[];
    observeYoutubeCommentItems(state,state.items);
    state.seenIds=new Set(state.items.map(x=>x.id));state.knownRootIds=new Set(state.items.filter(x=>x.type==='comment').map(x=>x.id));

   }
   if(state.kind==='youtube'&&target.operation==='comments'&&state.expected===null&&!state.commentHeaderAttempted){
    const fresh=await session.request(target.url);if(fresh.httpStatus!==200)return{...contentBase(target),status:fresh.httpStatus===429?'rate_limited':[401,403].includes(fresh.httpStatus)?'auth_required':'error',reason:'UPSTREAM_HTTP_'+fresh.httpStatus,items:[],pagination:{hasMore:true}};
    const expected=extractSocialMetrics(target,fresh).metrics.comment;if(expected!==null)state.expected=expected;else{const header=youtubeContinuations(fresh,target)[0];if(header&&!state.queue.some(x=>x.token===header.token))state.queue.unshift({...header,metadataOnly:true});}
    state.commentHeaderAttempted=true;
   }
   if(state.kind==='youtube'&&target.operation==='comments')observeYoutubeCommentItems(state,state.items);
   let pages=0,errorResult=null;
   while(state.context&&state.queue.length&&pages<maxPages&&Date.now()<deadline-1000&&state.seenIds.size<maxItems){
    if(options.nativeSourcePages&&target.operation==='source'&&state.items.length>0)break;
    // Oldest comments need the entire public stream before an earliest page can be emitted.
    if(!(target.operation==='comments'&&target.order==='oldest')&&state.items.length>=target.limit)break;
    const next=state.queue[0];if(state.visited.has(next.token)&&!next.metadataOnly){state.queue.shift();continue;}
    let response;try{response=await session.request('https://www.youtube.com'+next.api,{method:'POST',headers:{'content-type':'application/json',origin:'https://www.youtube.com',referer:target.url,accept:'application/json'},body:{context:state.context,continuation:next.token}});}catch(error){errorResult={...contentBase(target),status:'error',reason:httpFailure(error)};break;}pages++;state.totalRequests++;
    if(!acceptWork)return {...contentBase(target),status:'error',reason:'UPSTREAM_TIMEOUT'};
    let json;try{json=JSON.parse(response.html);}catch{}
    if(response.httpStatus!==200||!json){
     const failed=extractContentSnapshot(target,{...response,jsonResponses:[]});errorResult={...failed,status:response.httpStatus===200?'error':failed.status,reason:response.httpStatus===200?'INVALID_UPSTREAM_JSON':failed.reason,retryAfterMs:response.retryAfterMs};break;
    }
    const apiIssue=publicApiIssue([json]);if(apiIssue){errorResult={...contentBase(target),...apiIssue};break;}
    const snap={html:state.bootstrap,jsonResponses:[response.html],httpStatus:response.httpStatus,finalUrl:target.url,observedAt:new Date().toISOString()};
    if(next.metadataOnly){state.expected=extractSocialMetrics(target,snap).metrics.comment??state.expected;state.queue.shift();state.visited.add(next.token);continue;}
    const known=state.knownRootIds;
    const ui=target.operation==='comments'?youtubeHttpUi(target,snap,known):state.ui;
    const current=extractContentSnapshot({...target,seenIds:[]},snap,ui);
    if(terminal.has(current.status)){errorResult=current;break;}
    if(target.operation==='search'&&current.items.length){
     if(current.items.every(x=>state.seenIds.has(x.id))){const signature=JSON.stringify([...new Set(current.items.map(x=>x.id))].sort());state.repeatedSearchPages ||= new Set();if(state.repeatedSearchPages.has(signature)){state.paginationStalled=true;state.queue=[];break;}state.repeatedSearchPages.add(signature);}
     else state.repeatedSearchPages?.clear();
    }
    const selectedSort=youtubeCommentSortSelection(json);if(selectedSort)state.nativeNewestConfirmed=/^newest(?: first)?$/i.test(selectedSort);
    if(state.expected===null&&target.operation==='comments')state.expected=extractSocialMetrics(target,snap).metrics.comment;
    state.queue.shift();state.visited.add(next.token);
    observeYoutubeCommentItems(state,current.items);
    const byId=new Map(state.items.map(x=>[x.id,x]));for(const item of current.items)if(!state.seenIds.has(item.id)){byId.set(item.id,item);state.seenIds.add(item.id);if(item.type==='comment')state.knownRootIds.add(item.id);state.estimatedBytes=(state.estimatedBytes||50000)+Buffer.byteLength(JSON.stringify(item));}state.items=[...byId.values()];
    state.queue.push(...youtubeContinuations(snap,target,{response:json,reply:next.reply}).filter(x=>!state.visited.has(x.token)&&!state.queue.some(q=>q.token===x.token)));
   }
   const exhausted=!!state.context&&state.queue.length===0&&!state.paginationStalled;
   state.base.coverage=target.operation==='comments'?youtubeCommentCoverage(state,target):{recoveries:state.recoveries||0,scope:'anonymous_public_response',exhausted,complete:false,observedUnique:state.seenIds.size};
   if(errorResult){nextState=state;const kept=state.items.slice(0,target.limit);if(target.operation==='comments'&&target.platform==='youtube')for(const item of kept)applyYoutubeCommentDate(item,state.dateObservedAt??Date.now());return {...errorResult,identityVerified:state.base.identityVerified===true,bufferedItemsVerified:state.base.identityVerified===true,nativePostId:target.operation==='comments'?target.id:null,source:state.base.source||null,items:kept,count:kept.length,rootComments:kept.filter(x=>x.type==='comment').length,replies:kept.filter(x=>x.type==='reply').length,stagedCount:state.items.length,pagination:{nextCursor:null,hasMore:null,complete:false,reason:'UPSTREAM_READ_FAILED'},coverage:state.base.coverage};}
   if(!exhausted&&!state.paginationStalled&&state.items.length===0&&state.context&&state.queue.length&&state.seenIds.size<maxItems){nextState=state;state.collecting=true;return{...state.base,status:'partial',reason:'COLLECTION_IN_PROGRESS',phase:'collecting',items:[],count:0,rootComments:0,replies:0,stagedCount:state.seenIds.size,coverage:state.base.coverage,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'HTTP_PAGE_BUDGET'}};}
   if(target.operation==='comments'&&target.order==='oldest'&&!exhausted&&state.context&&state.seenIds.size<maxItems){
    nextState=state;return {...state.base,status:'partial',reason:'COLLECTION_IN_PROGRESS',phase:'collecting',items:[],count:0,rootComments:0,replies:0,stagedCount:state.items.length,coverage:state.base.coverage,pagination:{nextCursor:null,hasMore:true,complete:false,reason:'HTTP_PAGE_BUDGET'}};
   }
   const searchEnded=target.operation==='search'&&exhausted&&state.base.identityVerified&&state.seenIds.size>0;
   state.base={...state.base,status:state.items.length||state.paginationStalled?'partial':searchEnded?'ok':'unavailable',reason:state.paginationStalled?'UPSTREAM_REPEATED_PAGE':state.items.length?null:searchEnded?'NO_MORE_PUBLIC_ITEMS':'PUBLIC_ITEMS_NOT_RETURNED',pagination:{...state.base.pagination,nextCursor:null,hasMore:!exhausted&&!state.paginationStalled,complete:false,reason:state.paginationStalled?'UPSTREAM_REPEATED_PAGE':state.seenIds.size>=maxItems?'ITEM_BUDGET':exhausted?'PUBLIC_CONTINUATIONS_EXHAUSTED':'HTTP_PAGE_BUDGET'}};
   finishOrdering(state,target);
   // Continue streaming source/default-order pages without re-fetching old native pages.
   if(!(target.operation==='comments'&&target.order==='oldest')&&!exhausted&&!state.paginationStalled&&state.context&&state.seenIds.size<maxItems)state.streamMore=true;
   nextState=state.items.length>target.limit||state.streamMore?state:null;
   if(target.operation==='source')return sourceDelivery();
   return deliver(state,target,null);
  },binding);
  if(state)bindHttpState(state,binding);if(!state?.collecting&&!state?.streamMore&&!state?.dateHydrationPending)await binding.dispose?.();
  acceptWork=false;
  if(state)state.originTransport=value.transport;
  if(state&&!['ok','partial'].includes(value.status)&&state.queue?.length)nextState=state;
  const result={...contentBase(target),...value};
  if(nextState){
   
   result.pagination.hasMore=true;attachReadState(result,nextState);
  }
  return result;
 };
}
