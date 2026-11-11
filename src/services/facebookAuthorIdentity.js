// JSON numeric identifiers may exceed 2^53. Preserve the identifier token before parsing.
export function parseFacebookIdentityPayload(value){
 if(typeof value!=='string'||value.length>32768)return null;
 try{return JSON.parse(value.replace(/(?<!\\)("(?:actor_id|comment_id|media_id|target_id|user_id|profile_id)"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'));}catch{return null;}
}
const numeric=value=>typeof value==='string'&&/^\d+$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):null;
export function numericFacebookProfileUrl(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||! /^(?:www\.|m\.|web\.)?facebook\.com$/.test(u.hostname)||u.username||u.password||u.port||['story_fbid','fbid','comment_id'].some(k=>u.searchParams.has(k)))return null;
 const path=u.pathname.replace(/\/$/,'');if(path==='/profile.php')return numeric(u.searchParams.get('id'));
 const direct=/^\/(\d+)$/.exec(path);if(direct)return direct[1];
 const legacy=/^\/(?:people|pages)\/[^/]+\/(\d+)$/.exec(path);return legacy?.[1]||null;
 }catch{return null;}
}
export function facebookAuthorIdentity(author){
 const a=author||{},opaqueId=typeof a.id==='string'&&!numeric(a.id)?a.id:null,profileUrl=a.url||a.profile_url||a.profileUrl||null;
 const direct=numeric(a.id)||numeric(a.legacy_fbid)||numeric(a.actor_id)||numeric(a.user_id)||numeric(a.profile_id)||numeric(a.strong_id__);
 if(direct)return{id:direct,opaqueId,profileUrl,evidence:'numeric_author_id'};
 const fromUrl=numericFacebookProfileUrl(profileUrl);
 return{id:fromUrl,opaqueId,profileUrl,evidence:fromUrl?'numeric_author_profile_url':null};
}
export function parseFacebookAuthorRoutes(data,routes){
 const resolved=new Map();for(const route of routes){const p=data?.payload?.payloads?.[route];if(p?.error)continue;let result=p?.result;for(let i=0;i<5&&result?.type==='route_redirect';i++)result=result.redirect_result;
 const e=result?.exports,props=e?.rootView?.props,name=e?.canonicalRouteName||'';if(!/Profile|Page/.test(name)||/Error|Login|Checkpoint|Story|Video|Permalink/.test(name)||!props)continue;
 const fields=['pageID','pageId','userID','profileID','profileId'],candidates=fields.map(field=>({id:numeric(props[field]),field})).filter(x=>x.id&&x.id!=='0');if(new Set(candidates.map(x=>x.id)).size===1){const {id,field}=candidates[0];resolved.set(route,{id,evidence:'rootView.props.'+field,routeName:name});}
 }return resolved;
}
export function facebookAuthorRoute(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||! /^(?:www\.|m\.|web\.)?facebook\.com$/.test(u.hostname)||u.username||u.password||u.port||['story_fbid','fbid','comment_id'].some(k=>u.searchParams.has(k)))return null;
 const p=u.pathname.replace(/\/$/,'');if(p==='/profile.php')return /^(?:\d+|pfbid[A-Za-z0-9]+)$/.test(u.searchParams.get('id')||'')?'/profile.php?id='+u.searchParams.get('id'):null;
 if(/^\/(?:people|pages)\/[^/]+\/(?:\d+|pfbid[A-Za-z0-9]+)$/.test(p))return p;
 return /^\/[\w.%-]+$/.test(p)&&!/^\/(?:login|checkpoint|challenge|groups|photo\.php|permalink\.php)$/i.test(p)?p:null;
 }catch{return null;}
}
function commentEntityId(node){
 if(!node||typeof node!=='object')return null;
 const legacy=numeric(node.legacy_fbid);if(legacy)return legacy;
 if(typeof node.id==='string'){try{const m=/^comment:\d+_(\d+)$/.exec(Buffer.from(node.id,'base64').toString('utf8'));if(m)return m[1];}catch{}}
 return node.__typename==='Comment'?numeric(node.id):null;
}
function commentActorCandidates(node,cid,prefix='comment'){
 const out=[];
 const actor=(a,path,rank)=>{if(!a)return;const id=numeric(a.id)||numeric(a.legacy_fbid)||numeric(a.actor_id)||numeric(a.user_id)||numeric(a.profile_id)||numeric(a.strong_id__);if(id)out.push({id,evidence:'response.'+path+'.id',rank});else{const id=numericFacebookProfileUrl(a.url||a.profile_url);if(id)out.push({id,evidence:'response.'+path+'.url',rank:rank-30});}};
 actor(node.author,prefix+'.author',100);
 // Comment.user is the comment author projection, not viewer or parent_feedback owner.
 if(node.author?.__typename!=='Page')actor(node.user,prefix+'.user',90);
 const mirror=node.comet_comment_author_name_and_badges_renderer?.comment;
 if(mirror&&(!commentEntityId(mirror)||commentEntityId(mirror)===cid)){
  actor(mirror.author,prefix+'.author_name_and_badges.comment.author',100);
  if(node.author?.__typename!=='Page'&&mirror.author?.__typename!=='Page')actor(mirror.user,prefix+'.author_name_and_badges.comment.user',90);
  // The public comment response can expose the numeric actor only inside an
  // identity badge. Bind it to this comment, never to target_id/media_id.
  for(const badge of mirror.discoverable_identity_badges_web||[]){
   if(typeof badge?.serialized!=='string'||badge.serialized.length>4096)continue;
   const details=parseFacebookIdentityPayload(badge.serialized);if(!details)continue;
   const id=numeric(details?.actor_id);
   if(details?.surface==='comment'&&String(details.comment_id)===cid&&id&&id!=='0')
    out.push({id,evidence:'response.'+prefix+'.author_name_and_badges.comment.discoverable_identity_badges_web.serialized.actor_id',rank:100});
  }
 }
 const scan=(value,path,depth=0)=>{if(!value||typeof value!=='object'||depth>10)return;
  if(typeof value.serialized==='string'){const d=parseFacebookIdentityPayload(value.serialized),id=numeric(d?.actor_id);if(d?.surface==='comment'&&String(d.comment_id)===cid&&id&&id!=='0')out.push({id,evidence:'response.'+path+'.serialized.actor_id',rank:100});}
  for(const[k,v]of Object.entries(value))if(!['parent_feedback','parent_post_story','feedback','attached_story','attachments','body','ranges','comment_direct_parent'].includes(k)&&v&&typeof v==='object')scan(v,path+'.'+k,depth+1);
 };scan(node,prefix);
 return out;
}
export function collectFacebookActorAliases(roots){
 const aliases=new Map();
 const walk=v=>{if(!v||typeof v!=='object')return;
  const content=v.comet_sections?.content?.story,actors=v.actors||content?.actors;
  if(numeric(v.post_id)&&Array.isArray(actors)&&actors.length===1&&typeof v.tracking==='string'){
   const actor=actors[0],tracking=parseFacebookIdentityPayload(v.tracking),id=numeric(tracking?.content_owner_id_new);let story;
   try{story=/^S:_I(\d+):(?:VK:)?(\d+)(?::\d+)?$/.exec(Buffer.from(v.id||'','base64').toString('utf8'));}catch{}
   const videos=[v.video,v.short_form_video_context?.video,v.short_form_video_context?.playback_video].filter(Boolean),videoIds=videos.map(x=>numeric(x.id)).filter(Boolean),boundIds=new Set([v.post_id,...videoIds]),owners=videos.map(x=>numeric(x.owner?.id)).filter(Boolean);
   if(id&&id!=='0'&&/^pfbid[A-Za-z0-9]+$/.test(actor?.id||'')&&['User','Page'].includes(actor.__typename)&&boundIds.has(String(tracking?.top_level_post_id))&&story?.[1]===id&&boundIds.has(story?.[2])&&story?.[2]===String(tracking?.top_level_post_id)&&owners.every(owner=>owner===id)&&(!numeric(tracking.profile_id)||numeric(tracking.profile_id)===id)){
    const prior=aliases.get(actor.id);aliases.set(actor.id,prior&&(prior.id!==id||!prior.id)?{id:null,evidence:'response.author_identity_conflict'}:{id,evidence:'response.same_actor.story_tracking.content_owner_id_new'});
   }
  }
  for(const x of Object.values(v))if(x&&typeof x==='object')walk(x);
 };for(const root of roots)walk(root);return aliases;
}
export function collectFacebookCommentAuthorIdentities(chunks,merged){
 const candidates=new Map();
 const aliases=collectFacebookActorAliases([...chunks.map(x=>x.data),merged]),commentActors=new Map();
 const profileActors=new Map(),commentProfiles=new Map();
 const add=(cid,values)=>{if(!cid||!values.length)return;const rows=candidates.get(cid)||[];rows.push(...values);candidates.set(cid,rows);};
 const walk=x=>{if(!x||typeof x!=='object')return;
  if(['User','Page'].includes(x.__typename)&&numeric(x.id)&&x.url){const key=facebookAuthorProfileKey(x.url);if(key){const ids=profileActors.get(key)||new Set();ids.add(numeric(x.id));profileActors.set(key,ids);}}
  const cid=commentEntityId(x);if(cid){add(cid,commentActorCandidates(x,cid));const author=x.author,profileUrl=author?.url||author?.profile_url;const key=!numeric(author?.id)&&profileUrl?facebookAuthorProfileKey(profileUrl):null;if(key)commentProfiles.set(cid,key);if(author?.id&&!numeric(author.id))commentActors.set(cid,author.id);}
  for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);
 };
 for(const chunk of chunks){walk(chunk.data);
  // Deferred Relay fields may omit the comment ID: bind them through their exact response path.
  const path=chunk.path;if(!Array.isArray(path)||!chunk.data)continue;
  for(let n=path.length;n>=0;n--){let parent=merged;for(const key of path.slice(0,n))parent=parent?.[key];const cid=commentEntityId(parent);if(!cid)continue;const rel=path.slice(n).join('.');
   if(rel==='')add(cid,commentActorCandidates(chunk.data,cid,'deferred_comment'));
   else if(['author','user','comet_comment_author_name_and_badges_renderer.comment.author','comet_comment_author_name_and_badges_renderer.comment.user'].includes(rel)){
    const kind=rel.endsWith('author')?'author':'user';add(cid,commentActorCandidates({[kind]:chunk.data},cid,'deferred_comment'));
   }break;
  }
 }
 walk(merged);
 for(const[cid,opaque]of commentActors){const alias=aliases.get(opaque);if(alias?.id)add(cid,[{...alias,rank:110}]);else if(alias)add(cid,[{id:null,evidence:alias.evidence,rank:100}]);}
 for(const [cid,key]of commentProfiles){const ids=profileActors.get(key);if(ids)for(const id of ids)add(cid,[{id,evidence:'response.matching_author_profile_url.id',rank:70}]);}
 const out=new Map();
 for(const [cid,rows]of candidates){const native=rows.filter(x=>x.rank>=90),chosen=native.length?native:rows;const ids=new Set(chosen.map(x=>x.id));if(ids.size===1){const best=chosen.slice().sort((a,b)=>b.rank-a.rank)[0];out.set(cid,{id:best.id,evidence:best.evidence});}else out.set(cid,{id:null,evidence:'response.author_identity_conflict'});}
 return out;
}
export function facebookCommentAuthorIdentity(node,responseIdentities){
 const base=facebookAuthorIdentity(node?.author),cid=commentEntityId(node),projection=responseIdentities?.get(cid);
 if(projection)return{...base,id:projection.id,evidence:projection.evidence};
 const rows=commentActorCandidates(node,cid);if(rows.length){const native=rows.filter(x=>x.rank>=90),chosen=native.length?native:rows;if(new Set(chosen.map(x=>x.id)).size===1){const best=chosen.sort((a,b)=>b.rank-a.rank)[0];return{...base,id:best.id,evidence:best.evidence};}return{...base,id:null,evidence:'response.author_identity_conflict'};}
 return base;
}

export function facebookAuthorProfileKey(value){
 const route=facebookAuthorRoute(value);if(!route)return null;
 const name=route.slice(1).split('?')[0].toLowerCase();
 if(/^(?:login(?:\.php)?|checkpoint|challenge|home\.php|l\.php|redirect|share|watch|reels?|photos?|story\.php|permalink\.php|help|settings|events|marketplace)$/.test(name))return null;
 return 'facebook-profile:'+(/(?:^\/pfbid|[?&]id=pfbid|\/pfbid[A-Za-z0-9]+$)/.test(route)?route:route.toLowerCase());
}
export function cachedFacebookCommentAuthor(comment,cache){
 if(comment.authorId||comment.authorIdEvidence==='response.author_identity_conflict')return null;
 const exactKey=typeof comment.idPost==='string'&&/^\d+$/.test(comment.idPost)&&typeof comment._id==='string'&&/^\d+$/.test(comment._id)?'facebook-comment:'+comment.idPost+'_'+comment._id:null;
 const exact=exactKey?cache.get(exactKey):null;
 const exactValid=exact&&Number.isFinite(Date.parse(comment.time))&&Date.parse(exact.publishedDate)===Date.parse(comment.time);
 const keys=[comment.authorOpaqueId,comment.authorUrl,facebookAuthorProfileKey(comment.authorUrl),facebookAuthorProfileKey(facebookPublicAuthorProfileUrl({profileUrl:comment.authorUrl,opaqueId:comment.authorOpaqueId}))].filter(Boolean);
 const found=[...keys.map(k=>cache.get(k)),...(exactValid?[exact]:[])].filter(x=>typeof x?.id==='string'&&/^\d+$/.test(x.id)&&!/^user_confirmed(?:\.|$)/.test(x.evidence||''));
 if(!found.length)return null;
 if(new Set(found.map(x=>x.id)).size!==1)return{id:null,evidence:'cached_author_identity_conflict'};
 return{id:found[0].id,evidence:found[0].evidence||'verified_numeric_comment_response'};
}

export function facebookPublicAuthorProfileUrl(author){
 const value=author?.profileUrl||author?.url||null;
 if(typeof value==='string'){
  const absolute=value.startsWith('/')&&!value.startsWith('//')?'https://www.facebook.com'+value:value;
  const route=facebookAuthorRoute(absolute);if(route&&facebookAuthorProfileKey(absolute))return 'https://www.facebook.com'+route;
 }
 const opaque=author?.opaqueId;
 return typeof opaque==='string'&&/^pfbid[A-Za-z0-9]{10,250}$/.test(opaque)?'https://www.facebook.com/profile.php?id='+opaque:null;
}
