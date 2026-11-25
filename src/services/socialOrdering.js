import {readOnlyAssignedJson as assignedJson,snapshotPayloads,extractSocialMetrics}from './socialMetrics.js';
import {walkContentValues as walkContent}from './socialContent.js';
const label=v=>typeof v==='string'?v:v?.simpleText||v?.content||v?.runs?.map(x=>x.text||'').join('')||'';
export function selectedYoutubeCommentSort(snapshot){
 const initial=assignedJson(snapshot.html||'','ytInitialData');let chosen=null;
 walkContent(initial,v=>{for(const item of v.sortFilterSubMenuRenderer?.subMenuItems||[])if(/^(?:newest|newest first)$/i.test(item.title||'')){
  const c=item.serviceEndpoint;const token=c?.continuationCommand?.token;if(token)chosen={token,api:'/youtubei/v1/next',reply:false,kind:'root',requestedOrder:'latest',evidence:'native_comment_sort_menu.Newest'};
 }});return chosen;
}
export function youtubeSourceSort(snapshot){
 const initial=assignedJson(snapshot.html||'','ytInitialData');let verified=false;
 walkContent(initial,v=>{
  const c=v.chipCloudChipRenderer;if(c&&(c.isSelected||c.selected)&&/^(?:latest|newest|most recent)$/i.test(label(c.text)))verified=true;
  const chip=v.chipViewModel;if(chip&&(chip.isSelected||chip.selected||chip.isActive)&&/^(?:latest|newest)$/i.test(label(chip.text)))verified=true;
 });return verified;
}
export function exactSort(items,order){
 const known=items.filter(x=>Number.isFinite(Date.parse(x.createdAt))),unknown=items.filter(x=>!Number.isFinite(Date.parse(x.createdAt)));
 known.sort((a,b)=>(Date.parse(a.createdAt)-Date.parse(b.createdAt))*(order==='latest'?-1:1)||String(a.id).localeCompare(String(b.id)));
 return {items:[...known,...unknown],verified:unknown.length===0,missing:unknown.length};
}
export function describeMetaWindow(target,snapshot,result){
 const publicMetrics=target.operation==='comments'?extractSocialMetrics(target,snapshot):null;
 const expected=publicMetrics?.metrics.comment??null;
 let nativeSort=null;for(const root of snapshotPayloads(snapshot.html))walkContent(root,v=>{if(v.queryName==='BarcelonaPostPageDownwardQuery')nativeSort=v.variables?.sortOrder||null;});
 const sorted=target.order==='platform_default'?{items:result.items,verified:false,missing:0}:exactSort(result.items,target.order);
 result.items=sorted.items;
 result.ordering={requested:target.order,verified:target.order!=='platform_default'&&sorted.verified,scope:'available_window',serverFilterVerified:false,nativeOrder:nativeSort||'platform_default',evidence:sorted.verified?'exact_createdAt_sort':null,missingTimestamps:sorted.missing};
 result.coverage={scope:'anonymous_public_response',unfilteredVerified:false,exhausted:result.pagination.hasMore===false,complete:false,expectedPublicCount:expected,observedUnique:result.items.length,countMismatch:expected!==null&&result.items.length!==expected,reason:target.operation==='comments'?'FULL_COMMENT_MODE_UNVERIFIED':'PUBLIC_WINDOW_ONLY'};
 if(target.operation==='comments'&&result.identityVerified===true){
  const field=publicMetrics?.evidence?.comment,scope=target.platform==='threads'&&field==='matched_post.text_post_app_info.direct_reply_count'?'roots':target.platform==='instagram'&&field==='matched_post.comment_count'?'all':null;
  const ids=new Set(result.items.map(x=>x.id)),roots=result.items.filter(x=>x.type==='comment'),parents=new Map();let parentsVerified=true;
  for(const item of result.items.filter(x=>x.type==='reply')){if(!item.parentId||!ids.has(item.parentId)){parentsVerified=false;continue;}parents.set(item.parentId,(parents.get(item.parentId)||0)+1);}
  const checked=target.platform==='instagram'?roots:result.items;
  const repliesVerified=target.includeReplies===true&&checked.every(x=>Number.isSafeInteger(x.replyCount)&&x.replyCount>=0&&x.replyCount===(parents.get(x.id)||0));
  const countVerified=scope!==null&&Number.isSafeInteger(expected)&&expected>=0&&expected===(scope==='roots'?roots.length:ids.size);
  const complete=result.coverage.exhausted&&countVerified&&parentsVerified&&repliesVerified&&!result.warnings?.length;
  Object.assign(result.coverage,{version:2,countScope:scope,countVerified,replyCountsVerified:repliesVerified,parentsVerified,complete,evidence:complete?'matched_native_counter_and_all_reply_counts_exhausted':null,reason:complete?null:result.coverage.reason});
  result.pagination.complete=complete;
 }
 return result;
}
export function youtubeCommentSortSelection(json){let selected=null;walkContent(json,v=>{for(const item of v.sortFilterSubMenuRenderer?.subMenuItems||[])if(item.selected)selected=item.title||null;});return selected;}
