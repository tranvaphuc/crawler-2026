import { publicApiIssue } from './socialApiErrors.js';
import {readOnlyHtml} from './socialHtmlSnapshot.js';
import { analyzeFacebookPostHtml, normalizeFacebookPostInput } from './facebookShare.js';

export class SocialMetricsInputError extends Error {}
const invalid = message => { throw new SocialMetricsInputError(message); };
export const METRIC_KEYS = ['reactions', 'shares', 'comment', 'views', 'saved', 'reshares', 'repost', 'likes', 'quotes'];
const metricsEmpty = () => Object.fromEntries(METRIC_KEYS.map(k => [k, null]));
export function exactPublicCount(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function exactDisplayCount(text) {
  if (typeof text !== 'string') return null;
  // Abbreviations such as 1.2K are approximate and never reported as exact counts.
  const match = text.match(/(?:^|\s)(\d{1,3}(?:,\d{3})+|\d+)(?=\s|$)/);
  if (!match || /\d\s*[KMB]\b|\d\.\d/i.test(text)) return null;
  return exactPublicCount(match[1].replace(/,/g, ''));
}
const walk = (v, visit, depth = 0) => {
  if (!v || typeof v !== 'object' || depth > 65) return;
  visit(v);
  for (const x of Object.values(v)) if (x && typeof x === 'object') walk(x, visit, depth + 1);
};
// Cache only immutable source text. Every caller still receives a fresh parse.
// Two documents allow the ytcfg-normalized view without retaining a whole crawl.
const assignedDocuments=[],assignedCacheBytes=12*1024*1024;
let assignedRetainedBytes=0;
function assignedJsonText(html, marker) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignment = new RegExp(`(?:\\b${escapedMarker}|window\\["${escapedMarker}"\\])\\s*=\\s*\\{`).exec(html);
  if (!assignment) return null;
  const brace = assignment.index + assignment[0].lastIndexOf('{');
  let depth = 0, string = false, escaped = false;
  for (let i = brace; i < html.length; i++) {
    const c = html[i];
    if (string) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') string = false; }
    else if (c === '"') string = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(brace, i + 1);
  }
  return null;
}
const readonlyAssignmentRoots=new WeakSet(),youtubeAssignmentPresence=new WeakMap();
const escapedJsonKey=key=>[...key].map(c=>`(?:${c}|\\\\u${c.charCodeAt(0).toString(16).padStart(4,'0')})`).join('');
// Literal JSON key names or their Unicode escapes. Alternatives have disjoint
// prefixes and fixed lengths; this never interprets/evaluates native text.
const youtubeCommentKeyPattern=new RegExp(`"(?:${escapedJsonKey('commentRenderer')}|${escapedJsonKey('commentEntityPayload')})"\\s*:`, 'i');
function parseAssignedJson(html, marker, rememberPresence=false) {
  const cacheable=typeof html==='string'&&html.length<=2*1024*1024&&typeof marker==='string'&&marker.length<=128;
  let document=cacheable?assignedDocuments.find(entry=>entry.html===html):null,text;
  if(document?.texts.has(marker))text=document.texts.get(marker);
  else {
    text=assignedJsonText(html,marker);
    if(cacheable){
      if(!document){document={html,texts:new Map(),bytes:html.length*2};assignedDocuments.push(document);assignedRetainedBytes+=document.bytes;}
      if(document.texts.size<8){const bytes=(text?.length||0)*2;document.texts.set(marker,text);document.bytes+=bytes;assignedRetainedBytes+=bytes;}
      while(assignedDocuments.length>2||assignedRetainedBytes>assignedCacheBytes){const removed=assignedDocuments.shift();assignedRetainedBytes-=removed.bytes;}
    }
  }
  if(text===null)return null;
  try{const value=JSON.parse(text);if(rememberPresence&&value&&typeof value==='object'&&['ytInitialData','ytInitialPlayerResponse'].includes(marker))youtubeAssignmentPresence.set(value,youtubeCommentKeyPattern.test(text));return value;}catch{return null;}
}
export function assignedJson(html,marker){return parseAssignedJson(html,marker);}
export function readOnlyAssignmentYoutubeCommentPresence(root){return root&&typeof root==='object'&&readonlyAssignmentRoots.has(root)?youtubeAssignmentPresence.get(root):undefined;}
// Internal evidence readers may share an immutable parse. Public assignedJson
// retains its fresh, mutable-object contract. Bound both documents and input
// bytes so interleaved workers cannot retain an inventory of bootstraps.
const readOnlyAssignments=[];
export function readOnlyAssignedJson(html,marker){
 if(typeof html!=='string'||html.length>2*1024*1024||typeof marker!=='string'||marker.length>128)return assignedJson(html,marker);
 let entry=readOnlyAssignments.find(x=>x.html===html);
 if(entry?.values.has(marker))return entry.values.get(marker);
 const value=parseAssignedJson(html,marker,true),pending=value?[value]:[];
 while(pending.length){const node=pending.pop();if(!node||typeof node!=='object'||Object.isFrozen(node))continue;for(const child of Object.values(node))if(child&&typeof child==='object')pending.push(child);Object.freeze(node);}
 if(value&&typeof value==='object')readonlyAssignmentRoots.add(value);
 if(!entry){entry={html,values:new Map()};readOnlyAssignments.push(entry);}
 if(entry.values.size<8)entry.values.set(marker,value);
 while(readOnlyAssignments.length>2||readOnlyAssignments.reduce((n,x)=>n+x.html.length,0)>4*1024*1024)readOnlyAssignments.shift();
 return value;
}
// Keep just one immutable extraction, never parsed native objects or network data.
// Several readers inspect the same HTML synchronously; rebuilding its DOM each
// time wastes CPU. JSON.parse below still gives each caller independent objects.
let scriptHtml = null, scriptTexts = [], scriptPlatform;
function nativeScriptTexts(html,platform) {
  if (!html) return [];
  if (typeof html === 'string' && html === scriptHtml && platform===scriptPlatform) return scriptTexts;
  const $ = readOnlyHtml(html,{platform}), texts = [];
  $('script[type="application/json"]').each((_, e) => texts.push($(e).text()));
  if (typeof html === 'string') { scriptHtml = html; scriptTexts = texts; scriptPlatform=platform; }
  return texts;
}
export function snapshotPayloads(html, network = [],{platform}={}) {
  const values = [];
  for (const text of nativeScriptTexts(html,platform)) { try { values.push(JSON.parse(text)); } catch { /* Not JSON. */ } }
  for (const text of network) {
    if (typeof text !== 'string') continue;
    const clean=text.replace(/^for\s*\(;;\);\s*/, '');
    try { values.push(JSON.parse(clean)); continue; } catch { /* Fall through for newline-delimited streams. */ }
    for (const line of clean.split('\n')) { try { values.push(JSON.parse(line)); } catch { /* Stream fragments may be non-JSON. */ } }
  }
  return values;
}
function normalizeOne(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) invalid('link/url must be a non-empty string, maximum 4096 characters');
  let u; try { u = new URL(raw.trim()); } catch { invalid('A post/video URL is required'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) invalid('Only public HTTP(S) post URLs are accepted');
  const host = u.hostname.toLowerCase(), parts = u.pathname.split('/').filter(Boolean);
  if (/^(?:www\.|m\.|mbasic\.|web\.)?facebook\.com$/.test(host) || host === 'fb.com' || host === 'www.fb.com') {
    if (host.endsWith('fb.com')) u.hostname = 'www.facebook.com';
    const fb = normalizeFacebookPostInput(u.href);
    return { platform: 'facebook', url: fb.url, id: fb.token, facebook: fb };
  }
  if (/^(?:(?:www|m)\.)?tiktok\.com$/.test(host) && parts.length===3 && /^@[A-Za-z0-9._]+$/.test(parts[0]) && ['video','photo'].includes(parts[1]) && /^\d{1,30}$/.test(parts[2])) {
    return {platform:'tiktok',id:parts[2],url:`https://www.tiktok.com/${parts.join('/')}`,mediaType:parts[1]};
  }
  if (/^(?:www\.)?threads\.(?:com|net)$/.test(host) && parts.length === 3 && /^@[\w.]+$/.test(parts[0]) && parts[1] === 'post' && /^[\w-]+$/.test(parts[2])) {
    return { platform: 'threads', id: parts[2], url: `https://www.threads.com/${parts[0]}/post/${parts[2]}` };
  }
  if (/^(?:www\.)?instagram\.com$/.test(host) && parts.length === 2 && ['p', 'reel', 'tv'].includes(parts[0]) && /^[\w-]+$/.test(parts[1])) {
    return { platform: 'instagram', id: parts[1], url: `https://www.instagram.com/${parts[0]}/${parts[1]}/` };
  }
  if (/^(?:(?:www|m)\.)?youtube\.com$/.test(host) || host === 'youtu.be' || host === 'www.youtu.be') {
    const video = host.endsWith('youtu.be') ? parts[0] : parts[0] === 'watch' ? u.searchParams.get('v') :
      ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : null;
    if (!video || !/^[\w-]{11}$/.test(video)) invalid('A YouTube video URL is required');
    return { platform: 'youtube', id: video, url: `https://www.youtube.com/watch?v=${video}&hl=en` };
  }
  invalid('Supported post URLs: Facebook, Threads, Instagram, YouTube, TikTok');
}
export function normalizeMetricsInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('JSON object required');
  const supplied = ['link', 'url'].filter(k => body[k] !== undefined);
  if (!supplied.length) invalid('Supply link or url, or both');
  const targets = supplied.map(k => normalizeOne(body[k]));
  const target = targets.at(-1);
  if (targets.some(x => x.platform !== target.platform || x.id !== target.id)) invalid('link and url must refer to the same post/video');
  if (body.platform !== undefined && body.platform !== target.platform) invalid('platform does not match URL');
  // snsTopic alone is not a platform: an Instagram URL always routes to Instagram.
  return { ...target, link: body.link ?? null, originalUrl: body.url ?? null, sourceType: body.type ?? null,expectedNativeId:body.reference?.id||null };
}

function resultBase(target) {
  return { link: target.link, url: target.originalUrl, resolvedUrl: target.url, platform: target.platform,
    status: 'unavailable', reason: 'PUBLIC_COUNTERS_NOT_RETURNED', metrics: metricsEmpty(),
    metricStatus: Object.fromEntries(METRIC_KEYS.map(k => [k, { status: 'not_returned', reason: 'Not returned by the anonymous post response' }])),
    extraMetrics: {}, evidence: {}, identityVerified: false, checkedAt: new Date().toISOString() };
}
function set(r, key, value, field) {
  const n = exactPublicCount(value); if (n === null) return;
  if (r.metrics[key] !== null && r.metrics[key] !== n) {
    r.metrics[key] = null; r.metricStatus[key] = { status: 'conflicting', reason: 'Different exact counts in this response snapshot' }; return;
  }
  if (r.metricStatus[key]?.status === 'conflicting') return;
  r.metrics[key] = n; r.metricStatus[key] = { status: 'available', field }; r.evidence[key] = field;
}
function get(v, path) { return path.split('.').reduce((x, k) => x?.[k], v); }
function fields(r, node, definitions, scope) {
  for (const [metric, paths] of Object.entries(definitions)) {
    for (const path of paths) {
      const n = exactPublicCount(get(node, path)); if (n !== null) { set(r, metric, n, `${scope}.${path}`); break; }
    }
  }
}
function extras(r, node, scope) {
  for (const [key, val] of Object.entries(node || {})) {
    if (!/(?:_count|Count)$/.test(key)) continue;
    const count = exactPublicCount(val); if (count !== null) r.extraMetrics[`${scope}.${key}`] = count;
  }
}
function markPrivate(r, keys) {
  for (const key of keys) if (r.metrics[key] === null && r.metricStatus[key].status === 'not_returned') {
    r.metricStatus[key] = { status: 'not_public', reason: 'No exact public count returned; private/owner analytics are not accessed' };
  }
}
/** Counters from a primary post already verified by the Facebook reader. */
export function metricsFromVerifiedFacebookPost(target,post){
 const r=resultBase(target);r.identityVerified=true;r.nativeId=post.id;
 r.nativeIdentityAliases=[post.id,post.profileId&&post.postId?`${post.profileId}_${post.postId}`:null].filter(Boolean);
 if(target.facebook?.mediaId&&post.mediaId===target.facebook.mediaId){
  r.nativeId=post.mediaId;r.nativeMediaId=post.mediaId;r.nativePostId=post.postId;
  // A media URL identifies the video exactly even when its canonical Page
  // alias is absent. Do not claim an unverified profile is that Page.
  r.nativeIdentityAliases=post.ownerIdType==='unverified_profile'?[post.mediaId]:[...new Set([...r.nativeIdentityAliases,post.mediaId])];
 }
 fields(r,post,{reactions:['interactions.reactions'],likes:['interactions.likes'],shares:['interactions.shares'],comment:['interactions.comments'],views:['interactions.videoViews']},'primary_post');
 for(const x of post.interactions?.reactionBreakdown||[])if(x.count!==null)r.extraMetrics[`reaction.${x.name||x.id}`]=x.count;
 if(exactPublicCount(post.interactions?.nativeTotalCommentCount)!==null)r.extraMetrics['primary_feedback.total_comment_count']=post.interactions.nativeTotalCommentCount;
 markPrivate(r,['saved']);if(Object.values(r.metrics).some(x=>x!==null)){r.status='partial';r.reason=null;}return r;
}
// Reel routes use a different primary query and deferred Story projections.
// Bind the exact media and post before reading any counters from those patches.
function matchedFacebookReel(payloads,request,finalUrl){
 let resolved;try{resolved=normalizeFacebookPostInput(finalUrl);}catch{return null;}
 const mediaId=request.mediaId||resolved.mediaId;if(!mediaId||resolved.mediaId&&resolved.mediaId!==mediaId)return null;
 const results=[];
 for(const root of payloads)walk(root,v=>{
  if(!Array.isArray(v)||v[0]!=='RelayPrefetchedStreamCache'||v[1]!=='next')return;
  const args=v[3];if(/^(?:adp_)?FBReelsRootWithEntrypointQuery(?:RelayPreloader_|$)/.test(args?.[0]||'')&&args?.[1]?.__bbox?.result)results.push(args[1].__bbox.result);
 });
 const seeds=results.map(x=>x.data?.video).filter(v=>String(v?.id)===mediaId&&v.creation_story?.id&&/^\d+$/.test(String(v.creation_story.post_id||'')));
 const ids=new Set(seeds.map(v=>String(v.creation_story.post_id)));if(ids.size!==1)return null;
 const postId=[...ids][0];if(request.postId&&request.postId!==postId)return null;
 const storyIds=new Set(seeds.map(v=>v.creation_story.id)),stories=[];
 for(const result of results)walk(result,v=>{if(storyIds.has(v.id)&&(!v.post_id||String(v.post_id)===postId)&&v.feedback)stories.push(v);});
 return {mediaId,postId,stories};
}
export function extractSocialMetrics(target, { html = '', jsonResponses = [], finalUrl = target.url, httpStatus = 200 } = {}) {
  const r = resultBase(target);
  // Access failures take precedence over any stale counters embedded in error pages.
  if (httpStatus === 429) return { ...r, status: 'rate_limited', reason: 'HTTP_429' };
  if ([401,403].includes(httpStatus)) return { ...r, status: 'auth_required', reason: 'HTTP_AUTH_OR_ACCESS_DENIED' };
  if ([404,410].includes(httpStatus)) return { ...r, reason: 'POST_UNAVAILABLE' };
  if (httpStatus == null || httpStatus >= 400) return { ...r, status: 'error', reason: 'UPSTREAM_HTTP_ERROR' };
  if (/\/(?:accounts\/login|login|checkpoint|challenge)(?:\/|\.php|[?]|$)/i.test(finalUrl))
    return { ...r, status: /checkpoint|challenge/i.test(finalUrl) ? 'security_checkpoint' : 'auth_required', reason: 'LOGIN_OR_CHECKPOINT' };
  if (target.platform === 'threads') {
    try {
      const u = new URL(finalUrl);
      if (/^(?:www\.)?threads\.(?:com|net)$/.test(u.hostname) && u.searchParams.get('error') === 'invalid_post')
        return {...r,reason:'POST_UNAVAILABLE',accessEvidence:{kind:'native_invalid_post_redirect'}};
    } catch { /* No native redirect evidence. */ }
  }
  if (target.platform === 'youtube') {
    const player = readOnlyAssignedJson(html, 'ytInitialPlayerResponse');
    let sameVideo = false;
    try { const final = normalizeOne(finalUrl); sameVideo = final.platform === 'youtube' && final.id === target.id; } catch {}
    const playability = player?.playabilityStatus;
    if (sameVideo && (!player?.videoDetails?.videoId || player.videoDetails.videoId === target.id) && playability?.status === 'LOGIN_REQUIRED') {
      const privateVideo = /^Private video$/i.test(playability.reason || '');
      return {...r,status:privateVideo?'unavailable':'auth_required',reason:privateVideo?'POST_NOT_PUBLIC':'YOUTUBE_PLAYER_LOGIN_REQUIRED',accessEvidence:{kind:'native_player_playability',status:'LOGIN_REQUIRED',privateVideo}};
    }
  }
  const apiIssue=publicApiIssue(jsonResponses);
  if(apiIssue && apiIssue.status!=='error') return {...r,...apiIssue};
  const payloads = snapshotPayloads(html, jsonResponses,{platform:target.platform});
  if (target.platform === 'facebook') {
    const fb = analyzeFacebookPostHtml(html, target.facebook, {allowUnverifiedMediaSource:true});
    if (['POST_IDENTITY_MISMATCH','CONFLICTING_PRIMARY_POST_DATA','CONFLICTING_MEDIA_POST_IDENTITY'].includes(fb.reason)) r.reason=fb.reason;
    if (fb.post) {
      Object.assign(r,metricsFromVerifiedFacebookPost(target,fb.post));
      // Inspect only projections of the matched root story, not comments/attached originals.
      for (const root of payloads) walk(root, v => {
        if (v?.__typename !== 'Story' || String(v.post_id) !== fb.post.postId) return;
        const summary = v.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.comet_ufi_summary_and_actions_renderer?.feedback;
        fields(r, summary, { saved: ['save_count.count', 'saved_count.count'], reshares: ['reshare_count.count'], repost: ['repost_count.count'], views: ['video_view_count.count'] }, 'primary_feedback');
        for (const a of v.attachments || []) {
          const media = a.styles?.attachment?.media || a.media;
          if (media?.__typename === 'Video') {
            fields(r, media, { views: ['video_view_count.count', 'video_view_count'] }, 'primary_post.attached_video');
            extras(r, {play_count:media.play_count}, 'primary_post.attached_video');
          }
        }
        extras(r, summary, 'primary_feedback');
      });
    }
    const reel=matchedFacebookReel(payloads,target.facebook,finalUrl);
    if(reel){
      r.identityVerified=true;r.nativePostId=reel.postId;r.nativeMediaId=reel.mediaId;
      const requestedId=target.facebook.ownerId&&target.facebook.postId?`${target.facebook.ownerId}_${reel.postId}`:null;
      r.nativeId ||= requestedId||reel.mediaId;
      r.nativeIdentityAliases=[...new Set([...(r.nativeIdentityAliases||[]),requestedId,reel.postId,reel.mediaId].filter(Boolean))];
      r.resolvedUrl=finalUrl;
      for(const story of reel.stories){
        fields(r,story.feedback,{reactions:['reaction_count.count','unified_reactors.count'],likes:['likers.count'],comment:['total_comment_count','comment_rendering_instance.comments.total_count'],shares:['share_count.count','share_count_reduced'],views:['video_view_count.count','video_view_count']},'matched_reel.feedback');
        if(story.fb_reel_react_button?.story?.id===story.id)fields(r,story.fb_reel_react_button.story.feedback,{reactions:['unified_reactors.count','reaction_count.count'],likes:['likers.count']},'matched_reel.react_button.feedback');
      }
    }
    markPrivate(r, ['saved']);
  } else if (target.platform === 'threads' || target.platform === 'instagram') {
    const nodes = [];
    for (const root of payloads) walk(root, v => {
      if ((v.code === target.id || v.shortcode === target.id) && (v.pk || v.id) &&
          ['like_count', 'comment_count', 'text_post_app_info', 'edge_media_preview_like', 'edge_media_to_parent_comment', 'edge_liked_by', 'media_type'].some(k => Object.hasOwn(v, k))) nodes.push(v);
    });
    for (const node of nodes) {
      r.identityVerified = true;r.nativeId=String(node.pk||node.id);
      fields(r, node, { likes: ['like_count', 'edge_media_preview_like.count', 'edge_liked_by.count'],
        comment: ['comment_count', 'edge_media_to_parent_comment.count', 'edge_media_to_comment.count', 'text_post_app_info.direct_reply_count', 'text_post_app_info.reply_count'],
        views: ['view_count', 'video_view_count', 'play_count', 'text_post_app_info.view_count'],
        shares: ['share_count', 'text_post_app_info.share_count'], saved: ['save_count', 'saved_count'],
        reshares: ['reshare_count', 'text_post_app_info.reshare_count'],
        repost: ['repost_count', 'text_post_app_info.repost_count'], quotes: ['quote_count', 'text_post_app_info.quote_count'] }, 'matched_post');
      extras(r, node, 'post'); extras(r, node.text_post_app_info, 'text_post_app_info');
    }
    const $ = readOnlyHtml(html);
    const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
    let canonicalMatches = false;
    try { const c = normalizeOne(canonical); canonicalMatches = c.platform === target.platform && c.id === target.id; } catch { /* No confirmed post metadata. */ }
    if (canonicalMatches) {
      // Exact OG counts are a fallback when the rendered public page omits its API payload.
      const description = $('meta[property="og:description"]').attr('content') || '';
      for (const [metric, label] of [['likes', 'likes?'], ['comment', '(?:comments?|replies)'], ['views', 'views?']]) {
        if (r.metrics[metric] !== null) continue;
        const m = description.match(new RegExp(`(?:^|\\s)(\\d{1,3}(?:,\\d{3})+|\\d+)\\s+${label}\\b`, 'i'));
        if (m) { r.identityVerified = true; set(r, metric, m[1].replace(/,/g, ''), 'matched_canonical_post.og_description'); }
      }
      for (const root of payloads) walk(root, v => {
        if (!v['@type'] || !Array.isArray(v.interactionStatistic)) return;
        const entityUrl = v.url || v.mainEntityOfPage?.['@id'] || v['@id'];
        try { const e = normalizeOne(entityUrl); if (e.platform !== target.platform || e.id !== target.id) return; }
        catch { return; }
        for (const stat of v.interactionStatistic) {
          const type = stat.interactionType?.['@type'] || stat.interactionType;
          const metric = /LikeAction$/.test(type) ? 'likes' : /CommentAction$/.test(type) ? 'comment' : /WatchAction$|ViewAction$/.test(type) ? 'views' : null;
          if (metric && r.metrics[metric] === null) { r.identityVerified = true; set(r, metric, stat.userInteractionCount, `matched_canonical_post.schema.${type}`); }
        }
      });
    }
    // Likes are the public reaction metric on these platforms; retain both names with evidence.
    if (r.metrics.likes !== null) set(r, 'reactions', r.metrics.likes, 'matched_post.likes (public reaction count)');
    markPrivate(r, ['saved', 'shares']);
  } else if (target.platform === 'youtube') {
    const player = readOnlyAssignedJson(html, 'ytInitialPlayerResponse');
    const initial = readOnlyAssignedJson(html, 'ytInitialData');
    const players = [player, ...payloads].filter(Boolean).filter(x => x.videoDetails?.videoId === target.id);
    for (const p of players) {
      r.identityVerified = true; set(r, 'views', p.videoDetails.viewCount, 'videoDetails.viewCount');
    }
    if (r.identityVerified) {
      for (const data of [initial, ...payloads].filter(Boolean)) walk(data, v => {
        const primary = v.videoPrimaryInfoRenderer;
        if (primary) walk(primary.videoActions, x => {
          for (const k of ['accessibilityText', 'accessibilityLabel', 'label']) {
            if (typeof x[k] === 'string' && /\blikes?\b/i.test(x[k]) && !/dislikes?/i.test(x[k])) set(r, 'likes', exactDisplayCount(x[k]), 'videoPrimaryInfoRenderer.videoActions.like_accessibility');
          }
        });
        if (v.likeButtonViewModel) walk(v.likeButtonViewModel, x => {
          for (const k of ['accessibilityText', 'accessibilityLabel', 'label']) if (typeof x[k] === 'string' && /\blikes?\b/i.test(x[k]) && !/dislikes?/i.test(x[k])) {
            set(r, 'likes', exactDisplayCount(x[k]), 'likeButtonViewModel.accessibility');
          }
        });
        const header = v.commentsHeaderRenderer || v.commentsEntryPointHeaderRenderer;
        if (header) {
          const count = header.countText || header.commentCount;
          const text = count?.simpleText || count?.runs?.map(x => x.text || '').join('');
          set(r, 'comment', exactDisplayCount(text), 'commentsHeader.countText');
        }
      });
    }
    if (r.metrics.likes !== null) set(r, 'reactions', r.metrics.likes, 'video likes (dislike total is not publicly returned)');
    markPrivate(r, ['saved', 'shares', 'repost', 'reshares']);
  }
  const count = Object.values(r.metrics).filter(x => x !== null).length;
  if (count) { r.status = count === METRIC_KEYS.length ? 'ok' : 'partial'; r.reason = null; }
  else if (!r.identityVerified && r.reason === 'PUBLIC_COUNTERS_NOT_RETURNED') {
    r.reason = 'POST_ID_UNVERIFIED';
    // A login invitation alone does not prove a private/deleted post or an
    // invalid proxy session. Keep this unavailable, without blocking the key.
    if (target.platform === 'facebook') for (const root of payloads) walk(root, v => {
      if (Array.isArray(v) && v[0] === 'RelayPrefetchedStreamCache' && /^(?:adp_)?useCometLogInFormQuery(?:RelayPreloader_|$)/.test(v[3]?.[0] || '')) {
        r.reason = 'ANONYMOUS_POST_DATA_NOT_RETURNED';
        r.accessEvidence = {kind:'anonymous_login_bootstrap',postIdentityReturned:false};
      }
    });
  }
  else if ([401, 403].includes(httpStatus)) { r.status = 'auth_required'; r.reason = 'HTTP_AUTH_OR_ACCESS_DENIED'; }
  else if (httpStatus === 429) { r.status = 'rate_limited'; r.reason = 'HTTP_429'; }
  else if ([404, 410].includes(httpStatus)) { r.status = 'unavailable'; r.reason = 'POST_UNAVAILABLE'; }
  else if (/\/(?:accounts\/login|login|checkpoint|challenge)(?:\/|\.php|[?]|$)/i.test(finalUrl)) {
    r.status = /checkpoint|challenge/i.test(finalUrl) ? 'security_checkpoint' : 'auth_required'; r.reason = 'LOGIN_OR_CHECKPOINT';
  }
  if(apiIssue) { r.warnings=[apiIssue.reason]; if(count) {r.status='partial';r.reason='UPSTREAM_API_PARTIAL_ERROR';} else {r.status='error';r.reason=apiIssue.reason;} }
  return r;
}

export function metricsFailure(target, status, reason) { return { ...resultBase(target), status, reason }; }
