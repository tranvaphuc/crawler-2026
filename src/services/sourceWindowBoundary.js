export const SOURCE_WINDOW_POLICY='october_non_pinned_cutoff_v1';
const flags=['pinned','is_pinned','is_pinned_to_profile','is_pinned_to_timeline','is_pinned_by_admin','is_pinned_for_viewer','is_featured_post','is_announcement'];
const metadataKeys=new Set(['comet_sections','context_layout','story','metadata','badge','badges','pinned_badge','metadataBadgeRenderer','pinnedTextBadgeRenderer','context','timeline_context','story_header','header','labels']);
/** Inspect pin metadata, never post text, quoted posts, comments or attachments. */
export function sourcePostPin(...contexts){
 let explicit=false;const seen=new Set();
 function visit(v,depth=0){if(!v||typeof v!=='object'||seen.has(v)||depth>8)return false;seen.add(v);if(Array.isArray(v))return v.some(x=>visit(x,depth+1));
  for(const flag of flags){if(v[flag]===true||v[flag]===1)return true;if(v[flag]===false||v[flag]===0)explicit=true;}
  if(Array.isArray(v.pinned_for_users)&&v.pinned_for_users.length)return true;
  if(/Pinned|Featured(?:Post|Story)|Announcement/.test(v.__typename||''))return true;
  for(const key of ['label','text'])if(typeof v[key]==='string'&&/^(?:pinned(?: post| video)?|đã ghim|bài viết đã ghim|ghim)$/i.test(v[key].trim()))return true;
  for(const[k,x]of Object.entries(v))if(metadataKeys.has(k)&&visit(x,depth+1))return true;return false;
 }
 // Text labels are only inspected inside metadata, not on the post itself.
 for(const v of contexts){if(!v||typeof v!=='object')continue;if(/Pinned|Featured(?:Post|Story)|Announcement/.test(v.__typename||''))return{pinned:true,pinEvidence:'native_pin_metadata'};for(const flag of flags){if(v[flag]===true||v[flag]===1)return{pinned:true,pinEvidence:'native_pin_metadata'};if(v[flag]===false||v[flag]===0)explicit=true;}if(Array.isArray(v.pinned_for_users)&&v.pinned_for_users.length)return{pinned:true,pinEvidence:'native_pin_metadata'};for(const[k,x]of Object.entries(v))if(metadataKeys.has(k)&&visit(x))return{pinned:true,pinEvidence:'native_pin_metadata'};}
 return{pinned:false,pinEvidence:explicit?'native_pin_false':'native_no_pin_marker'};
}
/** User-approved cutoff: finish this batch, then stop on any older unpinned post. */
export function sourceWindowBoundary(result,{since,kind='source',observedAt=new Date().toISOString()}={}){
 if(kind!=='source'||result?.identityVerified!==true||!Number.isFinite(Date.parse(since)))return null;
 const items=result.items||[],older=items.find(x=>x.pinned!==true&&(x.pinned===false||typeof x.pinEvidence==='string')&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.createdAt)<Date.parse(since));
 if(!older)return null;
 return{reached:true,policy:SOURCE_WINDOW_POLICY,since,observedAt,postId:older.id,postPublishedAt:older.createdAt,pinEvidence:older.pinEvidence||'native_pin_false',ignoredPinnedInBatch:items.filter(x=>x.pinned===true).length,evidence:'user_approved_older_non_pinned_post',nativeServerOrderVerified:result.ordering?.serverFilterVerified===true};
}
