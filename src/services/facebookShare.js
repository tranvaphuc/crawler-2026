import https from 'node:https';
import { load } from 'cheerio';

const HOST = 'https://www.facebook.com';
const POST_TOKEN = /^(?:\d+|pfbid[A-Za-z0-9]+)$/;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const numeric = value => typeof value === 'string' && /^\d+$/.test(value) ? value : null;

export class FacebookShareInputError extends Error {}

/** Canonicalizes only post URLs. No arbitrary hosts, credentials, ports or redirect targets. */
export function normalizeFacebookPostInput(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 4096) {
    throw new FacebookShareInputError('Supply a Facebook post URL or ownerId_postId string.');
  }
  const raw = input.trim();
  if (/^\d+_\d+$/.test(raw)) {
    const [ownerId, postId] = raw.split('_');
    return { url: `${HOST}/${raw}`, ownerId, postId, token: postId };
  }
  let u;
  try { u = new URL(raw); } catch { throw new FacebookShareInputError('Invalid post URL.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port ||
      !/^(?:www\.|m\.|mbasic\.|web\.)?facebook\.com$/i.test(u.hostname)) {
    throw new FacebookShareInputError('Only Facebook post URLs are supported.');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  let ownerId = null, postId = null, token = null, path;
  if (parts.length === 1 && /^(?:permalink|story)\.php$/.test(parts[0])) {
    token = u.searchParams.get('story_fbid'); ownerId = numeric(u.searchParams.get('id'));
    if (!token || !POST_TOKEN.test(token) || !ownerId) throw new FacebookShareInputError('Post URL needs valid story_fbid and id.');
    path = `/permalink.php?${new URLSearchParams({ story_fbid: token, id: ownerId })}`;
  } else if (parts.length === 1 && /^\d+_\d+$/.test(parts[0])) {
    return normalizeFacebookPostInput(parts[0]);
  } else if (parts.length === 3 && parts[1] === 'posts' && /^[\w.-]+$/.test(parts[0]) && POST_TOKEN.test(parts[2])) {
    token = parts[2]; ownerId = numeric(parts[0]); path = `/${parts[0]}/posts/${token}/`;
  } else if (parts.length === 4 && parts[0] === 'groups' && /^[\w.-]+$/.test(parts[1]) && ['posts','permalink'].includes(parts[2]) && POST_TOKEN.test(parts[3])) {
    token = parts[3]; path = `/groups/${parts[1]}/posts/${token}/`;
  } else if(parts.length===2&&['reel','reels'].includes(parts[0])&&/^\d+$/.test(parts[1])){
    return {url:`${HOST}/reel/${parts[1]}/`,ownerId:null,postId:null,token:parts[1],mediaId:parts[1],mediaType:'reel'};
  } else if(parts.length===1&&['watch','video.php'].includes(parts[0])&&numeric(u.searchParams.get('v'))){
    const mediaId=u.searchParams.get('v');return {url:`${HOST}/watch/?v=${mediaId}`,ownerId:null,postId:null,token:mediaId,mediaId,mediaType:'video'};
  } else if(parts.length>=3&&parts.length<=4&&parts[1]==='videos'&&/^[\w.-]+$/.test(parts[0])&&numeric(parts.at(-1))){
    const mediaId=parts.at(-1);return {url:`${HOST}/watch/?v=${mediaId}`,inputUrl:`${HOST}/${parts.join('/')}/`,ownerId:null,postId:null,token:mediaId,mediaId,mediaType:'video'};
  } else if(parts.length===1&&['photo','photo.php'].includes(parts[0])&&numeric(u.searchParams.get('fbid'))){
    const mediaId=u.searchParams.get('fbid');return {url:`${HOST}/photo/?fbid=${mediaId}`,ownerId:null,postId:null,token:mediaId,mediaId,mediaType:'photo'};
  } else if (parts.length === 1 && POST_TOKEN.test(parts[0])) {
    token = parts[0]; path = `/${token}`;
  } else throw new FacebookShareInputError('Unsupported post URL. Use a permalink, /posts/ URL or ownerId_postId.');
  postId = numeric(token);
  return { url: HOST + path, ownerId, postId, token };
}

function walk(root, visit, depth = 0) {
  if (!root || typeof root !== 'object' || depth > 70) return;
  visit(root);
  for (const child of Object.values(root)) if (child && typeof child === 'object') walk(child, visit, depth + 1);
}

function fragments(story) {
  return [story, story?.comet_sections?.content?.story,
    story?.comet_sections?.context_layout?.story,
    story?.comet_sections?.context_layout?.story?.comet_sections?.title?.story,
    ...(story?.id&&story?.comet_sections?.title?.story?.id===story.id?[story.comet_sections.title.story]:[])].filter(Boolean);
}

function publicPostUrl(value) {
  try { return normalizeFacebookPostInput(value).url; } catch { return null; }
}

export function facebookStoryIdentity(story, identities = new Map()) {
  const fs = fragments(story);
  // This observed Relay Story encoding supplies the post owner, not a guessed Page ID.
  let encoded = null;
  for (const f of fs) {
    if (typeof f.id !== 'string' || f.id.length > 512) continue;
    const m = Buffer.from(f.id, 'base64').toString('utf8').match(/^S:_I(\d+):(\d+)(?::\d+)?$/);
    if (m) { encoded = { ownerId: m[1], postId: m[2] }; break; }
  }
  const postId = fs.map(f => numeric(f.post_id)).find(Boolean) || encoded?.postId || null;
  const actor = fs.find(f => f.actors?.[0])?.actors[0] || story.short_form_video_context?.video_owner || story.video?.owner;
  const profileId = encoded?.ownerId || numeric(actor?.id) || null;
  const mapped = identities.get(profileId);
  const personal = actor?.is_additional_profile_plus === false || mapped?.personal === true;
  // Professional-mode personal profiles may also expose delegate_page. An
  // explicit personal-profile flag takes precedence over that auxiliary Page.
  const pageId = personal?null:numeric(actor?.delegate_page?.id) || mapped?.pageId ||
    (actor?.__typename === 'Page' ? numeric(actor.id) : null);
  const ownerId = pageId || profileId;
  const originalUrl = fs.map(f => publicPostUrl(f.permalink_url || f.wwwURL || f.url)).find(Boolean) || null;
  const url=ownerId&&postId?`${HOST}/${ownerId}_${postId}`:null;
  return { id: ownerId && postId ? `${ownerId}_${postId}` : null, postId, ownerId,
    sourceId:ownerId,systemId:ownerId&&postId?`${ownerId}_${postId}`:null,originalUrl,profileId, pageId, ownerIdType: pageId ? 'page' : personal ? 'user' : 'unverified_profile',
    author: actor?.name || null, url };
}

const identity=facebookStoryIdentity;

function matchesRequest(story, request, identities, query) {
  const ident = identity(story, identities);
  const ownerMatches = !request.ownerId || [ident.ownerId, ident.profileId, ident.pageId].includes(request.ownerId);
  if (request.postId) return ident.postId === request.postId && ownerMatches;
  // Match the exact pfbid of the requested permalink; ignore unrelated stories in the HTML.
  return fragments(story).some(f => {
    try { const u = normalizeFacebookPostInput(f.permalink_url || f.wwwURL);
      if(u.token===request.token&&(!request.ownerId||u.ownerId===request.ownerId||ownerMatches))return true;
      // Opaque pfbid aliases are accepted only when the server's canonical route
      // AND the exact SinglePost preloader bind this same root Story ID.
      return ownerMatches&&request.ownerId&&(request.canonicalBindings||[]).some(b=>b.query===query&&b.storyId===story.id&&b.ownerId===request.ownerId&&u.token===b.token&&u.ownerId===b.ownerId);
    } catch { return false; }
  });
}

const unknown = (reason, post = null) => ({ status: 'unknown', isShare: null, reason, post, originalPost: null, evidence: null });

const exactCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const feedbackCount = value => exactCount(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
const consistentCount = (...values) => {
  const counts = new Set(values.map(feedbackCount).filter(x => x !== null));
  return counts.size === 1 ? [...counts][0] : null;
};
const textValue = value => typeof value === 'string' ? value : typeof value?.text === 'string' ? value.text : null;
const webUrl = value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
};

/** Whitelist fields from the verified primary story; never traverse comment/recommendation feedback. */
export function extractFacebookPostDetails(story) {
  const content = story.comet_sections?.content?.story || story;
  const target = story.comet_sections?.feedback?.story?.story_ufi_container?.story
    ?.feedback_context?.feedback_target_with_context;
  const feedback = target?.comet_ufi_summary_and_actions_renderer?.feedback || story.feedback || {};
  const reactions = (feedback.top_reactions?.edges || []).map(e => ({ id: String(e.node?.id || ''),
    name: e.node?.localized_name || null, count: exactCount(e.reaction_count) })).filter(e => e.id);
  const reactionCount = consistentCount(feedback.reaction_count?.count, feedback.unified_reactors?.count);
  const likes = consistentCount(reactions.find(r => r.id === '1635855486666999')?.count,
    feedback.likers?.count, reactionCount === 0 ? 0 : null);
  const renderedComments = [feedback.comment_rendering_instance?.comments?.total_count,
    feedback.comments_count_summary_renderer?.feedback?.comment_rendering_instance?.comments?.total_count,
    target?.comment_list_renderer?.feedback?.comment_rendering_instance?.comments?.total_count];
  // Native total_comment_count can include a different comment population
  // from the rendered public list. Preserve the public-list metric and expose
  // the native total separately rather than treating them as conflicts.
  const commentCount = renderedComments.some(x=>feedbackCount(x)!==null)
    ? consistentCount(...renderedComments) : feedbackCount(feedback.total_comment_count);
  const media = new Map(), attachments = [];
  // The attachment subtree may contain feedback and creation_story: do not enter those.
  function scan(v, depth = 0) {
    if (!v || typeof v !== 'object' || depth > 25) return;
    if (['Photo', 'Video'].includes(v.__typename) && v.id) {
      const image = v.photo_image || v.image || v.preferred_thumbnail?.image;
      const item = { id: String(v.id), type: v.__typename === 'Photo' ? 'photo' : 'video',
        url: webUrl(v.url), imageUrl: webUrl(image?.uri), width: exactCount(image?.width),
        height: exactCount(image?.height), alt: textValue(v.accessibility_caption),
        durationSeconds: typeof v.playable_duration_in_ms === 'number' ? v.playable_duration_in_ms / 1000 :
          typeof v.playable_duration === 'number' ? v.playable_duration : null,
        videoUrl: webUrl(v.playable_url_quality_hd || v.playable_url || v.browser_native_hd_url || v.browser_native_sd_url) };
      const key = item.type + ':' + item.id, prior = media.get(key) || {};
      for (const [k, x] of Object.entries(item)) if (x !== null || !own(prior, k)) prior[k] = x;
      media.set(key, prior);
    }
    for (const [k, x] of Object.entries(v)) {
      if (['feedback', 'creation_story', 'attached_story', 'actors', 'tracking', 'encrypted_tracking'].includes(k)) continue;
      if (x && typeof x === 'object') scan(x, depth + 1);
    }
  }
  for (const a of [...(story.attachments || []), ...(content.attachments || [])]) {
    scan(a);
    const detail = a.styles?.attachment || a;
    const link = webUrl(detail.url || a.url);
    const title = textValue(detail.title_with_entities || detail.title);
    const description = textValue(detail.description);
    if (link || title || description) attachments.push({ url: link, title, description });
  }
  const createdTime = Number.isSafeInteger(story.creation_time) && story.creation_time >= 0 &&
    story.creation_time < 8640000000000 ? story.creation_time : null;
  const message = textValue(content.message ?? story.message);
  const fields = { content: message, createdTime, createdAt: createdTime === null ? null : new Date(createdTime * 1000).toISOString(),
    authorUrl: webUrl(story.actors?.[0]?.url || content.actors?.[0]?.url),
    interactions: { reactions: reactionCount, likes, comments: commentCount, nativeTotalCommentCount: feedbackCount(feedback.total_comment_count),
      shares: consistentCount(feedback.share_count?.count, feedback.share_count_reduced),
      videoViews: consistentCount(feedback.video_view_count?.count, feedback.video_view_count), reactionBreakdown: reactions },
    media: [...media.values()], attachments: [...new Map(attachments.map(a => [JSON.stringify(a), a])).values()],
    hashtags: message === null ? [] : [...new Set(message.match(/#[\p{L}\p{N}_]+/gu) || [])] };
  fields.unavailableFields = [message === null ? 'content' : null, createdTime === null ? 'createdTime' : null,
    fields.interactions.reactions === null ? 'interactions.reactions' : null,
    commentCount === null ? 'interactions.comments' : null,
    fields.interactions.shares === null ? 'interactions.shares' : null].filter(Boolean);
  return fields;
}

/** Inspect primary permalink responses, never feed/recommendation/comment stories. */
export function analyzeFacebookPostPayload(payload, request, identities = new Map()) {
  if (/^(?:adp_)?GroupsCometLoggedOutPermalinkQuery(?:RelayPreloader_|$)/.test(payload.query || '')) {
    const data = payload.result?.data, story = data?.node_v2;
    const requestedGroup = new URL(request.url).pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\//)?.[1];
    const groupId = numeric(data?.group?.id);
    // Only the primary node_v2 carries the requested post. Deferred node/feed
    // projections can contain recommendations under the same query name.
    if (!requestedGroup || !groupId || story?.__typename !== 'Story') return unknown('PRIMARY_POST_NOT_FOUND');
    let groupMatches = requestedGroup === groupId;
    try {
      const groupUrl = new URL(data.group.url);
      if (!numeric(requestedGroup)) groupMatches = groupUrl.origin === HOST &&
        groupUrl.pathname.replace(/\/$/, '') === `/groups/${requestedGroup}`;
    } catch {}
    const targetGroup = story.comet_sections?.content?.story?.target_group?.id;
    if (!groupMatches || targetGroup && targetGroup !== groupId) return unknown('POST_IDENTITY_MISMATCH');
    const result = analyzeMatchedStory(story, request, identities, payload.query);
    if (result.post) {
      const id = `${groupId}_${result.post.postId}`;
      result.post = { ...result.post, id, systemId: id, ownerId: groupId, sourceId: groupId,
        groupId, ownerIdType: 'group', url: `${HOST}/groups/${groupId}/posts/${result.post.postId}/` };
    }
    return result;
  }
  if (!/SinglePost(?:Root|DialogContent)Query/.test(payload.query || '')) return unknown('PRIMARY_POST_NOT_FOUND');
  const data = payload.result?.data;
  const story = data?.node_v2 || (data?.node?.__typename === 'Story' ? data.node : null);
  if (story?.__typename !== 'Story') return unknown('PRIMARY_POST_NOT_FOUND');
  return analyzeMatchedStory(story,request,identities,payload.query);
}

function analyzeMatchedStory(story,request,identities,query){
  if (!matchesRequest(story, request, identities, query)) return unknown('POST_IDENTITY_MISMATCH');
  const post = { ...identity(story, identities), ...extractFacebookPostDetails(story) };
  const content = story.comet_sections?.content?.story;
  const refs = [[story, 'attached_story', 'data.node_v2.attached_story'],
    [content, 'attached_story', 'data.node_v2.comet_sections.content.story.attached_story'],
    [story, 'work_reposted_story', 'data.node_v2.work_reposted_story']];
  const related = refs.filter(([obj, key]) => obj?.[key] && typeof obj[key] === 'object');
  if (related.length) {
    const originals = related.map(([obj, key, path]) => ({ ...identity(obj[key], identities), path }));
    const original = originals.find(x => x.postId && x.postId !== post.postId) || originals.find(x => x.url && x.url !== post.url);
    if (!original) return unknown('INCOMPLETE_OR_CONFLICTING_SHARE_REFERENCE', post);
    const { path, ...originalPost } = original;
    // Enrich the reference with the other projection of the same original story.
    for (const other of originals.filter(x => x.postId === original.postId)) {
      for (const key of Object.keys(originalPost)) if (!originalPost[key] && other[key]) originalPost[key] = other[key];
    }
    // Never present an unverified additional-profile owner as the canonical source ID.
    if (originalPost.ownerIdType === 'unverified_profile') {
      originalPost.profilePostId = originalPost.id;
      originalPost.id = null;
      originalPost.ownerId = null;originalPost.sourceId=null;originalPost.systemId=null;originalPost.url=null;
    }
    return { status: 'resolved', isShare: true, reason: 'ATTACHED_OR_REPOSTED_STORY', post, originalPost,
      evidence: { field: path, query: query } };
  }
  if (story.work_is_repost === true) return { status: 'resolved', isShare: true, reason: 'EXPLICIT_REPOST_FLAG',
    post, originalPost: null, evidence: { field: 'data.node_v2.work_is_repost', query: query } };
  // Missing fields are not a negative result. Explicit null from the primary story is.
  const explicitNull = refs.slice(0, 2).find(([obj, key]) => own(obj, key) && obj[key] === null);
  if (explicitNull) return { status: 'resolved', isShare: false, reason: 'NO_ATTACHED_STORY', post, originalPost: null,
    evidence: { field: explicitNull[2], query: query } };
  return unknown('SHARE_FIELDS_NOT_AVAILABLE', post);
}

/** Bind media to its own creation/container story, then join projections by exact Relay story ID. */
function analyzeFacebookMediaRoots(roots,request,identities){
 const seeds=[],projections=new Map();
 const remember=v=>{if(typeof v.id==='string'&&(/Story/.test(v.__typename||'')||v.post_id||/^S:_I/.test(Buffer.from(v.id,'base64').toString('utf8')))){if(!projections.has(v.id))projections.set(v.id,[]);projections.get(v.id).push(v);}};
 for(const root of roots)walk(root,v=>{
  remember(v);
  if(String(v.id)===request.mediaId){
   for(const key of ['creation_story','story','container_story'])if(v[key]?.id)seeds.push({story:v[key],field:`matched_media.${key}`});
  }
 });
 const merge=(a,b,d=0)=>{if(d>30)return a;for(const[k,v]of Object.entries(b)){if(['__proto__','constructor','prototype'].includes(k)||v===undefined)continue;if(v&&typeof v==='object'&&!Array.isArray(v)){if(!a[k]||typeof a[k]!=='object'||Array.isArray(a[k]))a[k]={};merge(a[k],v,d+1);}else if(a[k]===undefined||a[k]===null||Array.isArray(a[k])&&a[k].length===0)a[k]=structuredClone(v);}return a;};
 const candidates=[];let unverifiedSource=false;
 for(const seed of seeds){const parts=[seed.story,...(projections.get(seed.story.id)||[])];
  if(new Set(parts.map(x=>numeric(x.post_id)).filter(Boolean)).size>1)return unknown('CONFLICTING_MEDIA_POST_IDENTITY');
  const story=parts.reduce((a,b)=>merge(a,b),{}),ident=identity(story,identities);
  if(!ident.postId||!ident.ownerId)continue;
  if(ident.ownerIdType==='unverified_profile'){unverifiedSource=true;continue;}
  const result=analyzeMatchedStory({...story,__typename:'Story'},{...request,ownerId:null,postId:ident.postId},identities,'matched_media_creation_story');
  if(result.post){result.post.mediaId=request.mediaId;result.post.mediaType=request.mediaType;result.post.inputUrl=request.inputUrl||request.url;result.post.identityEvidence=seed.field+'.post_id';candidates.push(result);}
 }
 const ids=new Set(candidates.map(x=>x.post.id));
 if(ids.size>1)return unknown('CONFLICTING_MEDIA_POST_IDENTITY');
 return candidates.find(x=>x.status==='resolved')||candidates[0]||unknown(unverifiedSource?'MEDIA_SOURCE_ID_UNVERIFIED':'MEDIA_POST_ID_UNVERIFIED');
}

// Video permalinks stream a primary video.story through several Relay patches.
// Join only that exact hero query and response path; never use related-video payloads.
function mergePrimaryProjection(target,source){
 for(const [key,value]of Object.entries(source||{})){
  if(['__proto__','prototype','constructor'].includes(key))throw Error('UNSAFE_PRIMARY_PATH');
  const prior=target[key];
  if(key==='video_view_count'){
   const before=feedbackCount(prior?.count??prior),after=feedbackCount(value?.count??value);
   if(before!==null&&after!==null){if(before!==after)throw Error('CONFLICTING_PRIMARY_POST_DATA');continue;}
  }
  if(['id','post_id'].includes(key)&&prior!=null&&value!=null&&prior!==value)throw Error('CONFLICTING_PRIMARY_POST_DATA');
  if(/^(?:count|total_count|reaction_count|total_comment_count|video_view_count|share_count_reduced)$/.test(key)&&feedbackCount(prior)!==null&&feedbackCount(value)!==null&&feedbackCount(prior)!==feedbackCount(value))throw Error('CONFLICTING_PRIMARY_POST_DATA');
  if(['attached_story','work_reposted_story'].includes(key)&&own(target,key)&&(prior===null)!==(value===null))throw Error('CONFLICTING_PRIMARY_POST_DATA');
  if(value&&typeof value==='object'){
   if(prior!=null&&(typeof prior!=='object'||Array.isArray(prior)!==Array.isArray(value)))throw Error('CONFLICTING_PRIMARY_POST_DATA');
   const next=target[key]||=(Array.isArray(value)?[]:{});mergePrimaryProjection(next,value);
  }else if(prior==null||value!=null)target[key]=value;
 }return target;
}
function analyzeVideoHeroPayloads(payloads,request,identities,{allowUnverifiedMediaSource=false}={}){
 const groups=new Map();for(const p of payloads)if(/^(?:adp_)?CometVideoHomeNewPermalinkHeroUnitQuery(?:RelayPreloader_|$)/.test(p.query||'')){if(!groups.has(p.query))groups.set(p.query,[]);groups.get(p.query).push(p.result);}
 const results=[];
 for(const [query,chunks]of groups){try{
  const root={};
  // Initial data is bound first, even if deferred scripts arrive earlier in the DOM.
  for(const chunk of chunks.filter(x=>!x.path))if(chunk.data?.video)mergePrimaryProjection(root,{video:chunk.data.video});
  if(!root.video)continue;
  for(const chunk of chunks.filter(x=>x.path)){
   const path=chunk.path;if(!Array.isArray(path)||path[0]!=='video')continue;
   if(path.length>40||path.some(k=>typeof k!=='string'&&!Number.isSafeInteger(k)||['__proto__','prototype','constructor'].includes(k)||typeof k==='number'&&(k<0||k>10000)))throw Error('UNSAFE_PRIMARY_PATH');
   let node=root;for(let n=0;n<path.length;n++){const k=path[n];if(node[k]==null)node[k]=typeof path[n+1]==='number'?[]:{};if(typeof node[k]!=='object')throw Error('CONFLICTING_PRIMARY_POST_DATA');node=node[k];}mergePrimaryProjection(node,chunk.data);
  }
  const video=root.video,story=video.story;
  if(!numeric(video.id)||!story?.id||request.mediaId&&request.mediaId!==video.id)continue;
  // The video creation story must refer to this same hero story, not a shared child.
  let ownMediaPath=null;
  for(const [i,a]of (story.attachments||[]).entries()){
   const media=a.styles?.attachment?.media||a.media;
   if(media?.__typename==='Video'&&media.id===video.id&&media.creation_story?.id===story.id){
    mergePrimaryProjection(story,media.creation_story);ownMediaPath=`data.video.story.attachments.${i}.media.creation_story.id`;
    // Video permalink feedback can be deferred on the primary media instead of
    // the story UFI. Only its own creation story may inherit those counters.
    const summary=story.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer?.feedback;
    if(media.feedback?.id){
     const feedback=structuredClone(media.feedback),views=feedback.video_view_count_renderer?.feedback;
     if(views?.id===feedback.id&&String(views.associated_video?.id)===video.id&&Number.isSafeInteger(views.video_view_count)&&views.video_view_count>=0)feedback.video_view_count=views.video_view_count;
     const primary=summary||story.feedback;
     if(!primary)story.feedback=feedback;
     else if(primary.id===feedback.id)mergePrimaryProjection(primary,feedback);
    }
   }
  }
  if(new Set(fragments(story).map(x=>numeric(x.post_id)).filter(Boolean)).size>1)throw Error('CONFLICTING_PRIMARY_POST_DATA');
  const ident=identity(story,identities);
  if(request.mediaId&&ident.ownerIdType==='unverified_profile'&&!(allowUnverifiedMediaSource&&ownMediaPath)){results.push(unknown('MEDIA_SOURCE_ID_UNVERIFIED'));continue;}
  const bound=request.mediaId?{...request,ownerId:ident.ownerId,postId:ident.postId}:request;
  if(!ident.postId||!ident.ownerId){results.push(unknown('PRIMARY_VIDEO_POST_ID_UNVERIFIED'));continue;}
  let result=analyzeMatchedStory(story,bound,identities,query);
  if(result.reason==='SHARE_FIELDS_NOT_AVAILABLE'&&ownMediaPath)result={...result,status:'resolved',isShare:false,reason:'OWN_MEDIA_CREATION_STORY',evidence:{field:ownMediaPath,query,storyId:story.id,mediaId:video.id}};
  if(result.post){result.post.mediaId=video.id;result.post.mediaType='video';}
  results.push(result);
 }catch(error){results.push(unknown(error.message==='CONFLICTING_PRIMARY_POST_DATA'?error.message:'INVALID_PRIMARY_VIDEO_PAYLOAD'));}}
 return results;
}

export function analyzeFacebookPostHtml(html, request, options={}) {
  const $ = load(html); const payloads = [], roots=[], identities = new Map(),routes=[],preloaders=[];
  $('script[type="application/json"]').each((_, script) => {
    let root; try { root = JSON.parse($(script).text()); } catch { return; }
    roots.push(root);walk(root, v => {
      const params=v.initialRouteInfo?.route?.params;
      if(params?.id&&params?.story_fbid)routes.push({ownerId:String(params.id),token:String(params.story_fbid)});
      if(/SinglePost(?:Root|DialogContent)Query/.test(v.preloaderID||'')&&typeof v.variables?.storyID==='string')preloaders.push({query:v.preloaderID,storyId:v.variables.storyID});
      const profileId = numeric(v.id);
      const pageId = numeric(v.delegate_page?.id) || (v.__typename === 'Page' ? profileId : null);
      if (profileId && (pageId || v.is_additional_profile_plus === false)) {
        const previous=identities.get(profileId);
        identities.set(profileId, { pageId:pageId||previous?.pageId||null, personal:previous?.personal===true||v.is_additional_profile_plus === false });
      }
      if (Array.isArray(v) && v[0] === 'RelayPrefetchedStreamCache' && v[1] === 'next') {
        const args = v[3]; if (args?.[1]?.__bbox?.result) payloads.push({ query: args[0], result: args[1].__bbox.result });
      }
    });
  });
  const heroResults=analyzeVideoHeroPayloads(payloads,request,identities,options);
  if(request.mediaId){const mediaResult=analyzeFacebookMediaRoots(roots,request,identities);if(mediaResult.status==='resolved')return mediaResult;const resolved=heroResults.filter(x=>x.status==='resolved');if(new Set(resolved.map(x=>x.isShare)).size>1)return unknown('CONFLICTING_PRIMARY_POST_DATA');return resolved[0]||mediaResult;}
  let boundRequest=request;
  if(request.ownerId&&!request.postId){
    const valid=[...new Map(routes.filter(x=>x.ownerId===request.ownerId&&/^pfbid[A-Za-z0-9]+$/.test(x.token)).map(x=>[x.token,x])).values()];
    if(valid.length===1)boundRequest={...request,canonicalBindings:preloaders.map(x=>({...x,...valid[0]}))};
  }
  const results = [...payloads.map(p => analyzeFacebookPostPayload(p, boundRequest, identities)),...heroResults];
  const conflict=heroResults.find(x=>x.reason==='CONFLICTING_PRIMARY_POST_DATA');if(conflict)return conflict;
  const resolved = results.filter(r => r.status === 'resolved');
  if (new Set(resolved.map(r => r.isShare)).size > 1) return unknown('CONFLICTING_PRIMARY_POST_DATA');
  return resolved.find(r => r.isShare) || resolved[0] || results.find(r => r.post) ||
    results.find(r => r.reason === 'POST_IDENTITY_MISMATCH') || unknown('PRIMARY_POST_NOT_FOUND');
}

/** Anonymous GET only; bounded body/time/redirects; never forwards cookies or auth. */
export function fetchAnonymousFacebookPost(url, { timeoutMs = 20000, maxBytes = 8 * 1024 * 1024 } = {}) {
  const deadline = Date.now() + timeoutMs;
  function get(current, redirects = 0) {
    return new Promise((resolve, reject) => {
      const u = new URL(current);
      if (u.protocol !== 'https:' || u.username || u.password || u.port || !/^(?:www\.|m\.|mbasic\.|web\.)?facebook\.com$/i.test(u.hostname)) {
        reject(Object.assign(new Error('Unsafe upstream redirect'), { code: 'UNSAFE_REDIRECT' })); return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) { reject(Object.assign(new Error('Timed out'), { code: 'UPSTREAM_TIMEOUT' })); return; }
      const req = https.get(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9', 'accept-encoding': 'identity' } }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume(); clearTimeout(timer);
          if (redirects >= 3) { reject(Object.assign(new Error('Too many redirects'), { code: 'TOO_MANY_REDIRECTS' })); return; }
          let next; try { next = new URL(res.headers.location, u); } catch { reject(Object.assign(new Error('Invalid redirect'), { code: 'UNSAFE_REDIRECT' })); return; }
          if (/\/(?:login|checkpoint|recover)(?:\/|\.php|$)/i.test(next.pathname)) { resolve({ status: res.statusCode, gate: true }); return; }
          resolve(get(next.href, redirects + 1)); return;
        }
        const chunks = []; let size = 0;
        res.on('data', chunk => { size += chunk.length; if (size > maxBytes) res.destroy(Object.assign(new Error('Response too large'), { code: 'UPSTREAM_TOO_LARGE' })); else chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'), retryAfter: res.headers['retry-after'] || null }); });
      });
      const timer = setTimeout(() => req.destroy(Object.assign(new Error('Timed out'), { code: 'UPSTREAM_TIMEOUT' })), remaining);
      req.on('error', error => { clearTimeout(timer); reject(error); });
      req.on('close', () => clearTimeout(timer));
    });
  }
  return get(url);
}

export async function checkFacebookPostShare(input, { fetchPage = fetchAnonymousFacebookPost } = {}) {
  const request = normalizeFacebookPostInput(input);
  const deadline = Date.now() + 40000;
  let response, result;
  try { response = await fetchPage(request.url, { timeoutMs: Math.max(1, deadline - Date.now()) }); }
  catch (error) {
    const reason = ['UPSTREAM_TIMEOUT', 'UPSTREAM_TOO_LARGE', 'UNSAFE_REDIRECT', 'TOO_MANY_REDIRECTS'].includes(error.code) ? error.code : 'UPSTREAM_NETWORK_ERROR';
    result = unknown(reason);
  }
  if (response) {
    if (response.gate || [401, 403].includes(response.status)) result = unknown('AUTH_OR_SECURITY_REQUIRED');
    else if (response.status === 429) result = { ...unknown('RATE_LIMITED'), retryAfter: response.retryAfter };
    else if ([404, 410].includes(response.status)) result = unknown('POST_UNAVAILABLE');
    else if (response.status !== 200) result = unknown('UPSTREAM_HTTP_ERROR');
    else result = analyzeFacebookPostHtml(response.body || '', request);
  }
  if(response?.status===200&&!response.gate&&result.reason==='PRIMARY_POST_NOT_FOUND'&&request.ownerId&&request.postId&&Date.now()<deadline){
    // Facebook's owner_post shortcut sometimes resolves to a profile instead of
    // the post. The numeric permalink is an equivalent public URL, bound by both IDs.
    try{const canonical=`${HOST}/permalink.php?${new URLSearchParams({story_fbid:request.postId,id:request.ownerId})}`;
      if(canonical===request.url)return {ok:false,...result,requestedUrl:request.inputUrl||request.url,httpStatus:response.status,checkedAt:new Date().toISOString()};
      const next=await fetchPage(canonical,{timeoutMs:Math.max(1,deadline-Date.now())});
      if(next.gate||[401,403].includes(next.status))result=unknown('AUTH_OR_SECURITY_REQUIRED');
      else if(next.status===429)result={...unknown('RATE_LIMITED'),retryAfter:next.retryAfter};
      else if(next.status===200){response=next;result=analyzeFacebookPostHtml(next.body||'',request);}
    }catch(error){result=unknown(error.code==='UPSTREAM_TIMEOUT'?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK_ERROR');}
  }
  if (result.isShare === true && result.originalPost?.ownerIdType === 'unverified_profile') {
    const original = result.originalPost;
    // The share projection often omits delegate_page. Fetch the identified original
    // post, then require its own primary metadata to confirm the profile -> Page map.
    try {
      const remaining = deadline - Date.now();
      if (remaining > 0 && (original.originalUrl||original.url)) {
        const target = normalizeFacebookPostInput(original.originalUrl||original.url);
        const extra = await fetchPage(target.url, { timeoutMs: remaining });
        if (extra.status === 200 && !extra.gate) {
          const resolved = analyzeFacebookPostHtml(extra.body || '', target).post;
          if (resolved?.postId === original.postId && resolved.profileId === original.profileId &&
              ['page', 'user'].includes(resolved.ownerIdType)) {
            result.originalPost = { ...resolved, identityEvidence: resolved.pageId ?
              'Original post metadata: matching profile.id -> delegate_page.id' : 'Original post metadata: explicit personal-profile flag' };
          }
        }
      }
    } catch { /* Share detection remains valid; an unresolved canonical ID stays null. */ }
    if (!result.originalPost.id) result.originalPost.identityReason = 'CANONICAL_OWNER_ID_UNAVAILABLE';
  }
  return { ok: result.status === 'resolved', ...result, requestedUrl: request.inputUrl||request.url,
    httpStatus: response?.status || null, checkedAt: new Date().toISOString() };
}

export async function getFacebookPostDetails(input, options) {
  const result = await checkFacebookPostShare(input, options);
  if (!result.post) return result;
  return { ...result, ok: true, status: 'resolved', reason: 'POST_DETAILS_LOADED',
    shareDetection: { status: result.status, reason: result.reason },
    scope: 'Public post metadata available in the anonymous response; not a full comment/reply export.' };
}
