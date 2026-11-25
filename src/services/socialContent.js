import {metaPublicationTime,youtubeSourcePublication} from './socialPublicationTime.js';
import {sourcePostPin} from './sourceWindowBoundary.js';
import {instagramProfileIdentity,bindInstagramSourcePost} from './instagramIdentity.js';
import {applyYoutubeCommentDate} from './youtubeCommentDates.js';
import {normalizeFacebookSource} from '../../scripts/facebook_source_resolver.mjs';
import { publicApiIssue } from './socialApiErrors.js';
import {readOnlyHtml} from './socialHtmlSnapshot.js';
import { readOnlyAssignedJson as assignedJson, readOnlyAssignmentYoutubeCommentPresence, snapshotPayloads, normalizeMetricsInput, exactPublicCount } from './socialMetrics.js';

export class SocialContentInputError extends Error {}
const invalid = reason => { throw new SocialContentInputError(reason); };
export function walkContent(v, visit, depth = 0, path = '') {
  if (!v || typeof v !== 'object' || depth > 65) return;
  if (visit(v, path) === false) return;
  for (const [key, x] of Object.entries(v)) if (x && typeof x === 'object') walkContent(x, visit, depth + 1, `${path}.${key}`);
}
// Value-only readers preserve traversal order/depth/pruning without building
// unused path strings. Scope-sensitive readers keep walkContent unchanged.
export function walkContentValues(v,visit,depth=0){
 if(!v||typeof v!=='object'||depth>65)return;
 if(visit(v)===false)return;
 for(const child of Object.values(v))if(child&&typeof child==='object')walkContentValues(child,visit,depth+1);
}
const youtubeCommentFilterCounts={checked:0,skipped:0,registeredReadonly:0,unknownConservative:0};
export const youtubeCommentNodeFilterStats=()=>({...youtubeCommentFilterCounts});
// Only registered immutable native assignments can prove key absence. Mutable
// API/foreign objects conservatively retain the original depth-bounded walk.
// Presence is indexed from the literal JSON while parsing, never by re-encoding.
// This is never an empty/end proof.
export function hasYoutubeCommentNodes(root){
 if(!root||typeof root!=='object')return false;
 youtubeCommentFilterCounts.checked++;
 if('commentRenderer' in root||'commentEntityPayload' in root||root.onResponseReceivedEndpoints?.length||root.onResponseReceivedActions?.length||root.onResponseReceivedCommands?.length)return true;
 const present=readOnlyAssignmentYoutubeCommentPresence(root);
 if(present===undefined){youtubeCommentFilterCounts.unknownConservative++;return true;}
 youtubeCommentFilterCounts.registeredReadonly++;if(!present)youtubeCommentFilterCounts.skipped++;
 return present;
}
const text = v => typeof v === 'string' ? v : v?.simpleText || v?.text || v?.runs?.map(x => x.text || '').join('') || v?.content || '';
const str = v => typeof v === 'string' || Number.isSafeInteger(v) ? String(v) : null;
const iso = v => { const n = typeof v === 'number' ? v * 1000 : typeof v === 'string' && /^\d{10}$/.test(v) ? Number(v) * 1000 : v; const d = new Date(n); return n != null && Number.isFinite(d.getTime()) ? d.toISOString() : null; };
const publicUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
function sourceInput(raw) {
  let u; try { u = new URL(raw); } catch { invalid('Supply a source URL'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) invalid('Invalid source URL');
  const p = u.pathname.split('/').filter(Boolean), host = u.hostname.toLowerCase();
  if (/^(?:www\.)?threads\.(com|net)$/.test(host) && p.length === 1 && /^@[\w.]+$/.test(p[0])) return { platform: 'threads', username: p[0].slice(1), id: p[0].slice(1).toLowerCase(), url: `https://www.threads.com/${p[0]}` };
  if (/^(?:www\.)?instagram\.com$/.test(host) && p.length === 1 && /^[\w.]+$/.test(p[0]) && !['accounts','explore','direct','reels','p','reel','tv'].includes(p[0].toLowerCase())) return { platform: 'instagram', username: p[0], id: p[0].toLowerCase(), url: `https://www.instagram.com/${p[0]}/` };
  if (/^(?:www\.|m\.|web\.|mbasic\.)?facebook\.com$/.test(host)||host==='fb.com'){const f=normalizeFacebookSource(u.href);if(f.status!=='SOURCE')invalid('Facebook source URL required');return{platform:'facebook',id:f.numericId,url:f.url,sourceType:f.typeHint==='group'?'group':null};}
  if (/^(?:(?:www|m)\.)?youtube\.com$/.test(host)) {
    let base;
    if (/^@[\w.\p{L}\p{N}-]+$/u.test(p[0] || '')) base = `/${p[0]}`;
    else if (p[0] === 'channel' && /^UC[\w-]{22}$/.test(p[1] || '')) base = `/channel/${p[1]}`;
    else if (['c','user'].includes(p[0]) && /^[\w.\p{L}\p{N}-]+$/u.test(p[1] || '')) base = `/${p[0]}/${p[1]}`;
    if (!base || p.length > (base.startsWith('/@') ? 2 : 3) || (p.at(-1) !== 'videos' && p.length > (base.startsWith('/@') ? 1 : 2))) invalid('Supply a YouTube channel URL, optionally /videos');
    return { platform: 'youtube', id: base.startsWith('/channel/') ? base : base.toLowerCase(), sourcePath: base, url: `https://www.youtube.com${base}/videos?hl=en` };
  }
  invalid('Supported sources: Threads profile, Instagram profile, YouTube channel');
}
export function normalizeContentInput(operation, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('JSON object required');
  if (!['source','comments','search'].includes(operation)) invalid('Invalid operation');
  const requestedLimit = body.limit ?? (operation==='search'&&body.count!==undefined?(body.count==='all'?'all':typeof body.count==='number'?Math.min(body.count,100):20):operation === 'comments' ? 50 : 20);
  if(requestedLimit!=='all'&&(!Number.isInteger(requestedLimit)||requestedLimit<1||requestedLimit>20000)) invalid('limit must be 1..20000 or all');
  const limit=requestedLimit==='all'?100:Math.min(100,requestedLimit);
  const requestedCount=body.count??(operation==='search'||requestedLimit==='all'||requestedLimit>100?requestedLimit:null);
  if(requestedCount!==null&&requestedCount!=='all'&&(!Number.isInteger(requestedCount)||requestedCount<1||requestedCount>20000))invalid('count must be 1..20000 or all');
  const sinceInput=body.since??body.stopBefore;let since=null;
  if(sinceInput!==undefined){if(operation!=='source'||typeof sinceInput!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(sinceInput)||!Number.isFinite(Date.parse(sinceInput)))invalid('since/stopBefore requires a source request and ISO date with timezone');since=new Date(sinceInput).toISOString();}
  if(body.since!==undefined&&body.stopBefore!==undefined&&Date.parse(body.since)!==Date.parse(body.stopBefore))invalid('since and stopBefore disagree');
  if (body.includeReplies !== undefined && typeof body.includeReplies !== 'boolean') invalid('includeReplies must be boolean');
  if(operation==='source' && body.order!==undefined && !['latest','platform_default'].includes(body.order)) invalid('Source order must be latest or platform_default');
  if(operation==='comments' && body.order!==undefined && !['oldest','platform_default'].includes(body.order)) invalid('Comment order must be oldest or platform_default');
  let target;
  if (operation === 'search') {
    if (!['threads','youtube'].includes(body.platform)) invalid('Search supports threads or youtube');
    if (typeof body.keyword !== 'string' || !body.keyword.trim() || body.keyword.trim().length > 200) invalid('keyword must contain 1..200 characters');
    const keyword = body.keyword.trim();
    if (body.order !== undefined && !['latest','relevance'].includes(body.order)) invalid('order must be latest or relevance');
    const uploadDate=body.uploadDate??'any';
    if(!['any','today','week','month','year'].includes(uploadDate)||body.platform!=='youtube'&&body.uploadDate!==undefined)invalid('uploadDate supports YouTube: any, today, week, month, year');
    const order=body.order || (body.platform==='youtube'&&body.uploadDate!==undefined?'relevance':'latest');
    const y=new URL('https://www.youtube.com/results');y.searchParams.set('search_query',keyword);y.searchParams.set('hl','en');
    const dateValue={today:2,week:3,month:4,year:5}[uploadDate],bytes=[...(order==='latest'?[8,2]:[]),...(dateValue?[18,2,8,dateValue]:[])];if(bytes.length)y.searchParams.set('sp',encodeURIComponent(Buffer.from(bytes).toString('base64')));
    target = { platform: body.platform, keyword, id: keyword, order,uploadDate, url: body.platform === 'threads' ? `https://www.threads.com/search?q=${encodeURIComponent(keyword)}&serp_type=default${order==='latest'?'&filter=recent':''}` : y.href };
  } else if (operation === 'comments') {
    try { target = normalizeMetricsInput(body); } catch { invalid('Supply a supported post URL'); }
    if (!['facebook','threads','instagram','youtube'].includes(target.platform)) invalid('Unsupported comment platform');
    if(target.platform==='facebook'&&!target.facebook.postId)invalid('Facebook numeric post ID must first be resolved by post/info');
  } else {
    const inputs = ['link','url'].filter(k => body[k] !== undefined);
    if (!inputs.length) invalid('Supply link or url');
    const ts = inputs.map(k => sourceInput(body[k])); target = ts.at(-1);
    if (ts.some(t => t.platform !== target.platform || t.id !== target.id)) invalid('link and url must refer to the same source');
  }
  if (body.platform !== undefined && body.platform !== target.platform) invalid('platform does not match URL');
  if (body.cursor !== undefined && (typeof body.cursor !== 'string' || body.cursor.length > 128)) invalid('Invalid cursor');
  if(operation==='source'&&target.platform==='facebook'){target.sourceType=body.sourceType||body.reference?.type||target.sourceType;if(!/^\d+$/.test(target.id||'')||!['page','user','group'].includes(target.sourceType))invalid('Resolve Facebook source first, or supply numeric source URL and sourceType page/user/group');}
  if(operation==='comments'&&target.platform==='facebook'&&body.sourceType!==undefined){if(!['page','user','group'].includes(body.sourceType))invalid('Invalid Facebook sourceType');target.sourceType=body.sourceType;}
  return { ...target, order:target.order || body.order || (operation==='comments'?'oldest':'latest'), operation, limit, requestedLimit, requestedCount, since, expectedNativeId:body.reference?.id||target.expectedNativeId||null, profileId:body.reference?.profileId||null, includeReplies: body.includeReplies !== false, cursor: body.cursor || null, link: body.link ?? null, originalUrl: body.url ?? null };
}
export function contentBase(target) {
  return { link: target.link, url: target.originalUrl, resolvedUrl: target.url, platform: target.platform, operation: target.operation,
    ...(target.keyword ? { keyword: target.keyword,...(target.platform==='youtube'?{searchFilters:{uploadDate:target.uploadDate||'any',verified:(target.uploadDate||'any')==='any'}}:{}) } : {}), status: 'unavailable', reason: 'PUBLIC_DATA_NOT_RETURNED',
    source: null, items: [], count: 0, rootComments: 0, replies: 0, identityVerified: false,
    ordering: { requested: target.order || (target.operation==='comments'?'oldest':'latest'), verified: false, evidence: null },
    pagination: { nextCursor: null, hasMore: null, complete: false, reason: null }, checkedAt: new Date().toISOString() };
}
export function metaPost(node, platform) {
  const publication=metaPublicationTime(node);
  node={...node,...(node.if_not_gated_logged_out||{})};
  const code = node.code || node.shortcode, id = str(node.pk) || str(node.id), user = node.user || node.owner || {};
  if (!id || !code || !/^[\w-]+$/.test(code)) return null;
  const username = user.username || null;
  const nativeUrl = platform === 'threads' ? username ? `https://www.threads.com/@${username}/post/${code}` : null : `https://www.instagram.com/${node.product_type === 'clips' ? 'reel' : 'p'}/${code}/`;
  const attachments = [];
  for (const media of [node, ...(node.carousel_media || [])]) {
    const image = media.image_versions2?.candidates?.[0]?.url || media.display_url || media.display_uri;
    const video = media.video_versions?.[0]?.url || media.video_url;
    if (image && publicUrl(image)) attachments.push({ type: 'image', url: image });
    if (video && publicUrl(video)) attachments.push({ type: 'video', url: video });
  }
  return { id, shortcode: code, url: nativeUrl, type: 'post', platform, text: text(node.caption) || text(node.edge_media_to_caption?.edges?.[0]?.node?.text),
    author: { id: str(user.pk) || str(user.id), username, name: user.full_name || null }, createdAt: publication?.createdAt||null,dateEvidence:publication?.evidence||null,
    publishedText: null, pinned:node.is_pinned ?? node.is_pinned_to_profile ?? null, attachments,
    metrics: { likes: exactPublicCount(node.like_count ?? node.edge_liked_by?.count), comment: exactPublicCount(node.comment_count ?? node.text_post_app_info?.direct_reply_count),
      views: exactPublicCount(node.view_count ?? node.play_count), repost: exactPublicCount(node.text_post_app_info?.repost_count), quotes: exactPublicCount(node.text_post_app_info?.quote_count) } };
}
export function commentMeta(n, target, parentId = null) {
  const user = n.user || n.owner || {}, id = str(n.pk) || str(n.id);
  if (!id || typeof n.text !== 'string') return null;
  const parent = str(n.parent_comment_id) || parentId;
  return { id, postId: target.id, url: target.url, type: parent ? 'reply' : 'comment', parentId: parent, platform: target.platform, text: n.text,
    author: { id: str(user.pk) || str(user.id), username: user.username || null, name: user.full_name || null },
    createdAt: iso(n.created_at || n.created_at_utc), publishedText: null, likes: exactPublicCount(n.comment_like_count ?? n.edge_liked_by?.count), replyCount: exactPublicCount(n.child_comment_count ?? n.edge_threaded_comments?.count) };
}
function rootsOf(snapshot,platform) { return [...snapshotPayloads(snapshot.html, snapshot.jsonResponses,{platform}), assignedJson(snapshot.html || '', 'ytInitialData'), assignedJson(snapshot.html || '', 'ytInitialPlayerResponse')].filter(Boolean); }
function hasNext(connection) { return typeof connection?.page_info?.has_next_page === 'boolean' ? connection.page_info.has_next_page : null; }
function mergeMore(old, value) { return value === true || old === true ? true : value === false ? false : old; }
export function extractContentSnapshot(target, snapshot, ui = {}) {
  const r = contentBase(target), roots = rootsOf(snapshot,target.platform), items = new Map();
  const add = x => { if (x?.id && (!target.seenIds || !target.seenIds.includes(x.id)) && (target.includeReplies || x.type !== 'reply')) {
    const previous=items.get(x.id);
    if(Number.isFinite(Date.parse(previous?.createdAt))&&!Number.isFinite(Date.parse(x.createdAt))&&(!previous.author?.id||!x.author?.id||previous.author.id===x.author.id))x={...x,createdAt:previous.createdAt,dateEvidence:previous.dateEvidence,datePrecision:previous.datePrecision,dateIsEstimated:previous.dateIsEstimated};
    items.set(x.id,x);
  } };
  const more = c => { r.pagination.hasMore = mergeMore(r.pagination.hasMore, hasNext(c)); };
  const $ = readOnlyHtml(snapshot.html || '',{platform:target.platform});
  if (snapshot.httpStatus === 429) { r.status = 'rate_limited'; r.reason = 'HTTP_429'; r.retryAfterMs = snapshot.retryAfterMs || 900000; return r; }
  if ([401,403].includes(snapshot.httpStatus)) { r.status = 'auth_required'; r.reason = 'HTTP_AUTH_OR_ACCESS_DENIED'; return r; }
  if ([404,410].includes(snapshot.httpStatus)) return { ...r, reason: 'SOURCE_OR_POST_UNAVAILABLE' };
  if (snapshot.httpStatus == null || snapshot.httpStatus >= 400) return { ...r, status: 'error', reason: 'UPSTREAM_HTTP_ERROR' };
  if (/\/(?:login|accounts\/login|challenge|checkpoint)(?:\/|[?]|$)/i.test(snapshot.finalUrl || '')) { r.status = /challenge|checkpoint/.test(snapshot.finalUrl) ? 'security_checkpoint' : 'auth_required'; r.reason = 'LOGIN_OR_CHECKPOINT'; return r; }
  if (ui.securityBlocked) { r.status = 'security_checkpoint'; r.reason = 'SECURITY_CHALLENGE'; return r; }
  const apiIssue=publicApiIssue(snapshot.jsonResponses);
  if(apiIssue && apiIssue.status!=='error') return {...r,...apiIssue};
  if (target.platform === 'threads' || target.platform === 'instagram') {
    const platform = target.platform;
    const instagramIdentity=platform==='instagram'&&target.operation==='source'?instagramProfileIdentity(roots,target.username):null;
    if(instagramIdentity?.reason==='INSTAGRAM_PROFILE_ID_CONFLICT')return{...r,status:'error',reason:instagramIdentity.reason};
    let queryConfirmed = false;
    for (const root of roots) walkContentValues(root, v => { if (v.query === target.keyword && Object.hasOwn(v,'recent')) queryConfirmed=true; });
    const boundMediaIds = new Set();
    for (const root of roots) walkContentValues(root, v => {
      for (const media of [v.media,v.xig_polaris_media,v.shortcode_media].filter(Boolean)) if ((media.code || media.shortcode) === target.id) {
        for (const id of [str(media.pk),str(media.id)].filter(Boolean)) boundMediaIds.add(id);
      }
    });
    r.nativePostId=[...boundMediaIds].find(x=>/^\d+$/.test(x))||[...boundMediaIds][0]||null;
    for (const root of roots) walkContent(root, (v, path) => {
      if (target.operation === 'search' && platform === 'threads' && v.query === target.keyword && [true, false, 0, 1].includes(v.recent)) {
        if (v.recent) r.ordering = { requested: 'latest', verified: true, evidence: 'server_preloaded_search_variables.recent=true' };
      }
      if (target.operation === 'source') {
        const connections = platform === 'threads' ? [v.mediaData] : [v.xig_user_by_username?.polaris_ordered_timeline_connection, v.xdt_api__v1__feed__user_timeline_graphql_connection, v.user?.edge_owner_to_timeline_media];
        for (const conn of connections.filter(Boolean)) {
          let matched = false;
          for (const edge of conn.edges || []) {
            const posts = platform === 'threads' ? edge.node?.thread_items?.map(x => x.post) || [] : [edge.node];
            for (const p of posts.filter(Boolean)) if ((p.user?.username || p.owner?.username || '').toLowerCase() === target.username.toLowerCase()) {
              matched = true; r.identityVerified = true;
              if(platform==='instagram'){r.source ||= {id:instagramIdentity?.verified?instagramIdentity.id:null,webScopedId:instagramIdentity?.webScopedId||null,idVerified:instagramIdentity?.verified===true,username:target.username,name:instagramIdentity?.name||null,url:target.url};add(bindInstagramSourcePost({...metaPost(p,platform),...sourcePostPin(p,edge,edge.node)},instagramIdentity));}
              else {r.source ||= { id: str(p.user?.pk) || str(p.user?.id), username: target.username, name: p.user?.full_name || null, url: target.url }; add({...metaPost(p, platform),...sourcePostPin(p,edge,edge.node,...(edge.node?.thread_items||[]).filter(x=>x.post===p))});}
            }
          }
          if (matched) more(conn);
        }
      } else if (target.operation === 'search' && platform === 'threads' && v.searchResults?.edges) {
        if (!queryConfirmed) return;
        r.identityVerified = true; more(v.searchResults);
        if (target.order === 'relevance') r.ordering = { requested:'relevance',verified:true,evidence:'server_search_results_for_keyword' };
        for (const edge of v.searchResults.edges) {
          const posts = edge.node?.thread?.thread_items || edge.node?.thread_items || [];
          // A search hit is the first item; attached/carousel/quoted posts are not independent hits.
          add(metaPost(posts[0]?.post || {}, platform));
        }
      } else if (target.operation === 'comments' && platform === 'instagram') {
        const media = v.xig_polaris_media || v.shortcode_media;
        if (media && (media.code === target.id || media.shortcode === target.id || boundMediaIds.has(str(media.pk)) || boundMediaIds.has(str(media.id)))) {
          r.identityVerified = true;
          const conn = media.comments_connection || media.edge_media_to_parent_comment || media.edge_media_to_comment;
          if (conn) { more(conn); for (const edge of conn.edges || []) {
            const n = edge.node; add(commentMeta(n, target));
            if(n.edge_threaded_comments)more(n.edge_threaded_comments);
            for (const child of n.edge_threaded_comments?.edges || []) add(commentMeta(child.node, target, str(n.pk) || str(n.id)));
          } }
        }
      } else if (target.operation === 'comments' && platform === 'threads') {
        const media = v.media;
        if (media && (media.code === target.id || boundMediaIds.has(str(media.pk)) || boundMediaIds.has(str(media.id)))) {
          r.identityVerified = true;
          const rootId = [...boundMediaIds].find(id => /^\d+$/.test(id)) || str(media.pk) || str(media.id);
          const info = media.text_post_app_info || {};
          const readThread = (conn, parentId = rootId, depth = 0) => {
            if (!conn || depth > 8) return; more(conn);
            let previous = parentId;
            for (const edge of conn.edges || []) {
              const n = edge.node?.post || edge.node, post = metaPost(n || {}, platform);
              if (!post || n.code === target.id || post.id === rootId) continue;
              const ni = n.text_post_app_info || {};
              const explicit = str(ni.reply_to_post_id) || str(ni.replied_to_post?.pk) || str(ni.replied_to_post?.id);
              const parent = explicit || previous;
              add({ ...post, type: parent === rootId ? 'comment' : 'reply', postId: target.id,
                parentId: parent === rootId ? null : parent, replyToPostId: parent,
                parentEvidence: explicit ? 'native_reply_to_post' : 'direct_replies.thread.posts_sequence',
                likes: exactPublicCount(n.like_count), replyCount: exactPublicCount(ni.direct_reply_count) });
              for (const group of ni.direct_replies?.edges || []) readThread(group.node?.posts, post.id, depth + 1);
              previous = post.id;
            }
          };
          // containing_thread contains ancestors, not this post's comments. Never import those.
          for (const group of info.direct_replies?.edges || []) readThread(group.node?.posts);
          for (const group of info.pinned_replies?.edges || []) readThread(group.node?.posts);
          readThread(info.self_thread?.posts);
          if (info.direct_replies) more(info.direct_replies);
        }
      }
    });
    // DOM items are restricted to the actual comment/post container by the browser adapter.
    if (target.operation === 'comments' && r.identityVerified) for (const item of ui.commentItems || []) add(item);
    if (!r.identityVerified && target.operation === 'source') {
      const canonical = $('meta[property="og:url"]').attr('content') || $('link[rel="canonical"]').attr('href');
      try { const c = sourceInput(canonical); if (c.id === target.id && c.platform === target.platform) { r.identityVerified = true; r.source = { id: null, username: target.username, name: $('meta[property="og:title"]').attr('content') || null, url: target.url }; } } catch { /* No identity evidence. */ }
    }
  } else if (target.platform === 'youtube') {
    const initials = roots.filter(x => x.contents?.twoColumnBrowseResultsRenderer || x.contents?.twoColumnSearchResultsRenderer || x.contents?.twoColumnWatchNextResults);
    if (target.operation === 'comments') {
      r.identityVerified = roots.some(x => x.videoDetails?.videoId === target.id);if(r.identityVerified)r.nativePostId=target.id;
      if (r.identityVerified) {
        for (const n of ui.commentItems || []) add(n);
        for (const root of roots) if(hasYoutubeCommentNodes(root))walkContentValues(root, v => {
          const e=v.commentEntityPayload, p=e?.properties;
          if (!p?.commentId) return;
          let item=items.get(p.commentId);
          // YouTube reply IDs contain their root comment ID before '.'. Bind to a
          // root actually rendered on this video, never an arbitrary entity payload.
          const parentId=p.commentId.includes('.') ? p.commentId.split('.')[0] : null;
          const knownRoot=(ui.commentItems || []).find(x=>x.id===parentId && x.type==='comment');
          if(!item && p.replyLevel>0 && knownRoot && target.includeReplies) {
            add({id:p.commentId,postId:target.id,url:`https://www.youtube.com/watch?v=${target.id}&lc=${encodeURIComponent(p.commentId)}`,
              platform:'youtube',type:'reply',parentId,parentEvidence:'native_comment_id_prefix_and_reply_level',text:text(p.content),
              author:{id:e.author?.channelId || null,name:e.author?.displayName || null,username:e.author?.displayName?.startsWith('@')?e.author.displayName.slice(1):null},
              createdAt:null,publishedText:p.publishedTime || null,likes:exactPublicCount(e.toolbar?.likeCountNotliked),replyCount:exactPublicCount(e.toolbar?.replyCount)});
            item=items.get(p.commentId);
          }
          if(!item)return;
          item.likes=exactPublicCount(e.toolbar?.likeCountNotliked);
          item.replyCount=exactPublicCount(e.toolbar?.replyCount);
          item.publishedText=p.publishedTime || item.publishedText;
          item.author.id=e.author?.channelId || item.author.id;
          item.author.name=e.author?.displayName || item.author.name;
        });
      }
      if (ui.commentsDisabled) { r.pagination.hasMore = false; r.pagination.complete = true; r.status = 'ok'; r.reason = 'COMMENTS_DISABLED'; }
    } else {
      const selected = initials.flatMap(x => x.contents?.twoColumnBrowseResultsRenderer?.tabs || []).map(t => t.tabRenderer).find(t => t?.selected);
      const initial = initials.find(x => x.contents?.twoColumnSearchResultsRenderer);
      let content;
      if (target.operation === 'source' && selected && /videos/i.test(selected.title || '') && ui.sourceVerified) {
        r.identityVerified = true; r.source = ui.source || { id: null, name: null, url: target.url }; content = selected.content;
      }
      if (target.operation === 'search' && initial) {
        r.identityVerified = ui.searchKeyword === target.keyword;
        content = initial.contents.twoColumnSearchResultsRenderer.primaryContents;
        if (target.order === 'relevance' && r.identityVerified) r.ordering = { requested:'relevance',verified:true,evidence:'matched_keyword.search_primary_results' };
        if (ui.latestVerified && target.order !== 'relevance') r.ordering = { requested: 'latest', verified: true, evidence: ui.latestEvidence || 'selected_upload_date_sort' };
        r.searchFilters={uploadDate:target.uploadDate||'any',verified:(target.uploadDate||'any')==='any'||ui.uploadDateVerified===true,evidence:ui.uploadDateEvidence||null};
      }
      const readVideos = data => walkContent(data, (v, path) => {
        if (/secondaryContents|secondaryResults|adSlot|promoted|shelfRenderer|reelShelfRenderer|richShelfRenderer/i.test(path)) return false;
        const n = v.videoRenderer || v.gridVideoRenderer;
        if (n && /^[\w-]{11}$/.test(n.videoId || '')) {
          const author = n.ownerText?.runs?.[0] || n.shortBylineText?.runs?.[0] || n.longBylineText?.runs?.[0];
          add({ id: n.videoId, url: `https://www.youtube.com/watch?v=${n.videoId}`, type: 'post', platform: 'youtube', text: text(n.title), description: text(n.descriptionSnippet),
            author: { id: author?.navigationEndpoint?.browseEndpoint?.browseId || r.source?.id || null, name: author?.text || r.source?.name || null, username: null },
            createdAt:null,...youtubeSourcePublication(n,snapshot.observedAt), publishedText: text(n.publishedTimeText) || null, ...sourcePostPin(n), attachments: [], metrics: { views: exactPublicCount(text(n.viewCountText).replace(/\s+views?$/i, '').replace(/,/g,'')) } });
        }
        const model = v.lockupViewModel;
        if (model?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && /^[\w-]{11}$/.test(model.contentId || '')) {
          const m = model.metadata?.lockupMetadataViewModel;
          add({ id: model.contentId, url: `https://www.youtube.com/watch?v=${model.contentId}`, type: 'post', platform: 'youtube', text: text(m?.title), description: null,
            author: { id: r.source?.id || null, name: r.source?.name || null, username: null }, createdAt: null, publishedText: ui.videoDates?.[model.contentId] || m?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap(row=>(row.metadataParts||[]).map(part=>text(part.text))).find(label=>/(?:\bago\b|trước|\d{4}-\d\d-\d\d|[A-Za-z]{3,9} \d{1,2},? \d{4})/u.test(label||'')) || null, ...sourcePostPin(model,m), attachments: [], metrics: { views: null } });
        }
      });
      if (r.identityVerified && content) {
        readVideos(content);
        let unverifiedSourceContinuation=false;
        // Continuation actions only; never scan recommended/secondary videos in a whole watch page.
        for (const root of roots) for (const action of [...(root.onResponseReceivedEndpoints||[]),...(root.onResponseReceivedActions||[]),...(root.onResponseReceivedCommands||[])]) {
          const a = action.appendContinuationItemsAction || action.reloadContinuationItemsCommand;
          if(!a||!Array.isArray(a.continuationItems))continue;
          const binding=ui.sourceContinuationTarget,bound=target.operation==='source'&&binding?.sourceId===r.source?.id&&(!target.expectedNativeId||binding.sourceId===target.expectedNativeId)&&typeof binding.targetId==='string'&&binding.targetId.length>0&&binding.targetId.length<=128;
          const accepted=bound?a.targetId===binding.targetId:/^(?:browse-feed|rich-grid|search-feed)/.test(a.targetId||'');
          if(accepted)readVideos(a.continuationItems);
          else if(target.operation==='source')unverifiedSourceContinuation=true;
        }
        if(unverifiedSourceContinuation){r.status='error';r.reason='YOUTUBE_SOURCE_CONTINUATION_TARGET_UNVERIFIED';r.items=[];r.count=0;r.pagination={...r.pagination,hasMore:true,complete:false};return r;}
      }
    }
  }
  if(target.operation==='search'&&target.platform==='youtube'&&(target.uploadDate||'any')!=='any'&&!r.searchFilters?.verified){r.status='sort_unavailable';r.reason='UPLOAD_DATE_FILTER_UNVERIFIED';r.items=[];return r;}
  if (target.operation === 'search' && !r.ordering.verified) { r.status = 'sort_unavailable'; r.reason = 'LATEST_SORT_UNVERIFIED'; r.items = []; return r; }
  r.items = [...items.values()];
  if(target.platform==='youtube'&&target.operation==='comments')for(const item of r.items){item.nativeObservedAt=new Date(snapshot.observedAt??Date.now()).toISOString();applyYoutubeCommentDate(item,snapshot.observedAt??Date.now());}
  r.count = r.items.length;
  r.rootComments = r.items.filter(x => x.type === 'comment').length; r.replies = r.items.filter(x => x.type === 'reply').length;
  if (r.count) { r.status = 'partial'; r.reason = null; }
  else if (r.status !== 'ok' && ui.loginBlocked) { r.status = 'auth_required'; r.reason = 'LOGIN_REQUIRED_FOR_MORE_DATA'; }
  else if (r.identityVerified && r.pagination.hasMore === false) { r.status = 'ok'; r.reason = 'NO_MORE_PUBLIC_ITEMS'; }
  else if (r.identityVerified) r.reason = 'PUBLIC_ITEMS_NOT_RETURNED';
  if(apiIssue) { r.warnings=[apiIssue.reason]; if(r.count) {r.status='partial';r.reason='UPSTREAM_API_PARTIAL_ERROR';} else {r.status='error';r.reason=apiIssue.reason;r.pagination.complete=false;} }
  return r;
}
