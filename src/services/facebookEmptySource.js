import {snapshotPayloads} from './socialMetrics.js';
import {mergeChunks} from '../../scripts/paginate_facebook_group_capture.js';
const numeric=value=>typeof value==='string'&&/^\d+$/.test(value);
export function facebookSourceBootstrapUrl(target){
 return target.operation==='source'&&target.sourceType==='page'&&numeric(target.profileId)
  ?`https://www.facebook.com/${target.profileId}`:target.url;
}
// Only a complete, target-bound timeline query proves an empty public source.
// Sidebar tiles, optional-field failures, UI strings, and unfinished streams do not.
export function facebookEmptySourceProof(snapshot,target,roots=snapshotPayloads(snapshot.html||'')){
 if(target?.operation!=='source'||!['page','user'].includes(target.sourceType)||snapshot.httpStatus!==200)return null;
 let url;try{url=new URL(snapshot.finalUrl);}catch{return null;}
 if(!/(^|\.)facebook\.com$/.test(url.hostname)||/\/(?:login|checkpoint)(?:\/|\.php|$)/.test(url.pathname))return null;
 const queries=new Map();let authenticated=false;
 function walk(v,depth=0){
  if(!v||typeof v!=='object'||depth>75)return;
  if(Array.isArray(v)&&v[0]==='CurrentUserInitialData'&&String(v[2]?.USER_ID||'0')!=='0')authenticated=true;
  if(Array.isArray(v)&&v[0]==='RelayPrefetchedStreamCache'&&v[1]==='next'&&/ProfileCometTimeline.*(?:Query|Refetch)/.test(v[3]?.[0]||'')){
   const [key,packet]=v[3],bbox=packet?.__bbox;if(bbox?.result){const rows=queries.get(key)||[];rows.push(bbox);queries.set(key,rows);}
  }
  for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1);
 }
 for(const root of roots)walk(root);
 if(authenticated)return null;
 for(const rows of queries.values()){
  rows.sort((a,b)=>(a.sequence_number||0)-(b.sequence_number||0));
  if(rows.at(-1).complete!==true)continue;
  const chunks=rows.map(r=>r.result);
  // Errors on the timeline or identity cannot prove empty. Optional page ad
  // fields can fail independently (seen on the actual empty TNEX page).
  if(chunks.some(c=>(c.errors||[]).some(e=>!Array.isArray(e.path)||e.path.length<=1||e.path.includes('timeline_list_feed_units')||e.path.at(-1)==='id')))continue;
  let merged;try{merged=mergeChunks(chunks);}catch{continue;}
  const user=merged.user,feed=user?.timeline_list_feed_units;
  const matched=target.sourceType==='page'
   ?user?.delegate_page?.id===target.id&&(!target.profileId||user.id===target.profileId)
   :user?.id===target.id;
  if(!matched||!Array.isArray(feed?.edges)||feed.edges.length!==0||feed.page_info?.has_next_page!==false||user.profile_pinned_post)continue;
  return{sourceId:target.id,profileId:user.id,sourceType:target.sourceType,evidence:'matched_profile.timeline_list_feed_units.empty_and_exhausted',hasMore:false};
 }
 return null;
}
