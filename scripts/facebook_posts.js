/**
 * fetchFacebookPosts({ groupId, groupName, cursor, numberPosts, proxy, type })
 * Returns { ok, status, posts, cursor, hasNextPage, warnings }. Node.js 20+, ESM.
 *
 * Configure FACEBOOK_FEED_HAR_GROUP / _PAGE / _USER (or FACEBOOK_FEED_HAR).
 * Each HAR must contain a real feed request for that type. Optional harPath
 * overrides the environment for one call. Auth headers/cookies are not replayed.
 * Null counters mean the response did not provide an exact count.
 */
import { readFile } from 'node:fs/promises';
import {sourcePostPin} from '../src/services/sourceWindowBoundary.js';
import {facebookAuthorIdentity,collectFacebookActorAliases} from '../src/services/facebookAuthorIdentity.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { mergeChunks, parseChunks, post as sendRequest } from './paginate_facebook_group_capture.js';
import { FacebookFeedError, inputError, templateError, classifyTransportError,
  responseError, graphqlError } from './facebook_post_errors.js';
export { FacebookFeedError } from './facebook_post_errors.js';

const GROUP_QUERY = 'GroupsCometFeedRegularStoriesPaginationQuery';
const PROFILE_QUERY = /^ProfileCometTimeline.*(?:Query|Refetch)$/;
const LIKE_ID = '1635855486666999';
const blockedHeaders = new Set(['host', 'content-length', 'accept-encoding',
  'connection', 'cookie', 'authorization', 'x-fb-navigation-chain']);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const text = value => typeof value === 'string' ? value : value?.text ?? '';

function feedbackFor(story) {
  return story.comet_sections?.feedback?.story?.story_ufi_container?.story
    ?.feedback_context?.feedback_target_with_context
    ?.comet_ufi_summary_and_actions_renderer?.feedback ?? story.feedback ?? {};
}

export function normalizePost(story, { groupId, type, edge }) {
  const content = story.comet_sections?.content?.story ?? story;
  const feedback = feedbackFor(story);
  const actors=story.actors||content.actors||[];
  const aliases=collectFacebookActorAliases([story]);
  const actor=(type==='page'?actors.find(a=>String(a.id)===String(groupId)||facebookAuthorIdentity(a).id===String(groupId)||aliases.get(a.id)?.id===String(groupId)):null)||actors[0];
  const identity=facebookAuthorIdentity(actor),alias=aliases.get(actor?.id),conflict=alias&&(!alias.id||identity.id&&identity.id!==alias.id),authorId=conflict?null:alias?.id||identity.id||actor?.id||null;
  const attachment = (content.attachments ?? story.attachments)?.[0];
  const detail = attachment?.styles?.attachment ?? attachment;
  const reactions = feedback.top_reactions;
  const like = reactions?.edges?.find(e => String(e.node?.id) === LIKE_ID);
  // Missing Like is only zero if every reaction type was supplied, or total=0.
  const allTypesPresent = reactions && Number.isInteger(reactions.count) &&
    reactions.count === reactions.edges?.length;
  const likes = like ? count(like.reaction_count) :
    (feedback.reaction_count?.count === 0 || allTypesPresent ? 0 : null);
  const postId = String(story.post_id);
  return {
    _id: postId,
    ...sourcePostPin(story,edge),
    originalUrl: story.permalink_url||story.url||content.permalink_url||null,
    mediaId: detail?.media?.id ? String(detail.media.id) : story.short_form_video_context?.video?.id ? String(story.short_form_video_context.video.id) : null,
    mediaType: story.short_form_video_context?.video ? 'reel' : detail?.media?.__typename==='Video' ? 'video' : detail?.media?.__typename==='Photo' ? 'photo' : null,
    authorId,
    author: actor?.name ?? null,
    content: text(content.message ?? story.message),
    created_time: Number.isSafeInteger(story.creation_time) ? story.creation_time : null,
    reactions: count(feedback.reaction_count?.count),
    title: text(story.title) || text(detail?.title_with_entities) || text(detail?.title),
    description: text(detail?.description),
    like: likes,
    shares: count(feedback.share_count?.count),
    comment: count(feedback.comment_rendering_instance?.comments?.total_count ??
      feedback.comments_count_summary_renderer?.feedback
        ?.comment_rendering_instance?.comments?.total_count ?? feedback.comments?.total_count),
    url: type === 'group'
      ? `https://www.facebook.com/groups/${groupId}/posts/${postId}/`
      : `https://www.facebook.com/${groupId}/posts/${postId}/`,
  };
}

function findFeed(root, type) {
  if (type === 'group') return root.node?.group_feed ?? null;
  // Profile feed field names vary between captures. Ignore nested comments,
  // reactions and attachment connections; only accept a connection of posts.
  const queue = [{ value: root, field: '' }];
  while (queue.length) {
    const { value, field } = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value.edges) && value.page_info &&
        ((value.edges.length === 0 && /feed/i.test(field)) ||
          value.edges.some(e => e.node?.post_id))) return value;
    for (const [key, child] of Object.entries(value)) {
      if (!['edges', 'feedback', 'attachments', 'comments'].includes(key) &&
          child && typeof child === 'object') queue.push({ value: child, field: key });
    }
  }
  return null;
}

async function loadTemplate(harPath, type) {
  const har = JSON.parse(await readFile(harPath, 'utf8'));
  const candidates = (har.log?.entries ?? []).map(entry => ({
    entry, form: Object.fromEntries(new URLSearchParams(entry.request?.postData?.text ?? '')),
  })).filter(({ form }) => type === 'group'
    ? form.fb_api_req_friendly_name === GROUP_QUERY
    : PROFILE_QUERY.test(form.fb_api_req_friendly_name ?? ''));
  const template = candidates.at(-1);
  if (!template) throw new Error(`HAR has no ${type} feed query. Supply a matching HAR for type=${type}.`);
  if (template.entry.request.url !== 'https://www.facebook.com/api/graphql/') {
    throw new Error('Unexpected HAR endpoint');
  }
  if (Object.values(template.form).includes('[REDACTED]')) {
    throw new Error('Use the original HAR with unredacted request tokens');
  }
  template.variables = JSON.parse(template.form.variables);
  template.headers = Object.fromEntries(template.entry.request.headers.filter(h =>
    !h.name.startsWith(':') && !blockedHeaders.has(h.name.toLowerCase()))
    .map(h => [h.name.toLowerCase(), h.value]));
  return template;
}

export function createProxyAgent(proxy) {
  if (!proxy) return undefined;
  let url;
  if (typeof proxy === 'string') url = new URL(proxy);
  else if (proxy.url) url = new URL(proxy.url);
  else {
    if (!proxy.host || !proxy.port) throw new Error('Proxy needs host and port');
    const protocol = (proxy.protocol ?? 'http').replace(/:$/, '');
    url = new URL(`${protocol}://${proxy.host}:${proxy.port}`);
    if (proxy.username != null) url.username = proxy.username;
    if (proxy.password != null) url.password = proxy.password;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Proxy must use http:// or https://');
  }
  return new HttpsProxyAgent(url);
}

/** Configure once; the returned function takes only the business parameters. */
export function createFacebookPostFetcher({ harPaths = {}, request = sendRequest,
  delayMs = 2000, maxPages = 100, pageSize = 50 } = {}) {
  if (!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw inputError('pageSize must be 1..100');
  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(maxPages) || maxPages < 1) {
    throw inputError('Invalid delayMs or maxPages');
  }
  return async function fetchFacebookPosts(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw inputError('Options must be an object');
    }
    let { groupId } = options;
    const { groupName = '', cursor = null, numberPosts = 20,
      proxy = null, type = 'group', harPath } = options;
    if (!['group', 'page', 'user'].includes(type)) throw inputError('type must be group/page/user');
    if (!/^\d+$/.test(String(groupId))) throw inputError('groupId must be a numeric ID');
    if (typeof groupId === 'number' && !Number.isSafeInteger(groupId)) {
      throw inputError('Pass long Facebook IDs as strings');
    }
    if (typeof groupName !== 'string') throw inputError('groupName must be a string');
    if (cursor !== null && (typeof cursor !== 'string' || !cursor)) {
      throw inputError('cursor must be null or a nonempty Facebook cursor string');
    }
    if (!Number.isSafeInteger(numberPosts) || numberPosts < 1) {
      throw inputError('numberPosts must be a positive integer');
    }
    groupId = String(groupId);
    const source = harPath ?? harPaths[type] ?? process.env[`FACEBOOK_FEED_HAR_${type.toUpperCase()}`]
      ?? process.env.FACEBOOK_FEED_HAR;
    if (!source) throw templateError(`Set FACEBOOK_FEED_HAR_${type.toUpperCase()} or configure harPaths.${type}`);
    let template;
    try { template = await loadTemplate(source, type); }
    catch { throw templateError(`Cannot load a valid ${type} feed request from the configured HAR`); }
    const { form, headers, variables } = template;
    if (type === 'group') {
      variables.sortingSetting = 'CHRONOLOGICAL';
      variables.id = groupId;
      variables.youthIntegrityHostID = groupId;
    } else {
      // Use only target fields present in the captured timeline query.
      const idFields = ['id', 'userID', 'userId', 'profileID', 'profileId', 'pageID', 'pageId'];
      let changed = false;
      for (const key of idFields) if (Object.hasOwn(variables, key)) {
        variables[key] = groupId;
        changed = true;
      }
      if (!changed) throw templateError('Timeline template has no recognized profile ID variable');
    }
    headers.referer = type === 'group'
      ? `https://www.facebook.com/groups/${groupId}/` : `https://www.facebook.com/${groupId}/`;
    let agent;
    try { agent = createProxyAgent(proxy); }
    catch { throw new FacebookFeedError('INVALID_PROXY', 'Invalid HTTP/HTTPS proxy configuration', { category: 'config' }); }
    const jar = new Map(), seen = new Set();
    const result = new Map(), warnings = [];
    let next = cursor, pagesFetched=0, graphqlDiagnostic=null;
    const success = (hasNextPage, limited = false) => ({
      ok: true,
      status: limited ? 'PARTIAL' : !result.size
        ? cursor === null ? 'EMPTY' : 'END_OF_FEED'
        : !hasNextPage ? 'END_OF_FEED' : 'OK',
      posts: [...result.values()].sort((a,b)=>(b.created_time??-Infinity)-(a.created_time??-Infinity)), cursor: next, hasNextPage, warnings: [...warnings],
      ordering:{requested:'latest',verified:[...result.values()].every(p=>p.created_time!==null),scope:'returned_page',serverFilterRequested:type==='group'?'CHRONOLOGICAL':null,serverFilterVerified:false},
      coverage:{scope:'anonymous_public_response',complete:false,exhausted:!hasNextPage},requests:pagesFetched,
    });
    const paginationError = (message, problem = null) => {
      if (graphqlDiagnostic && problem) graphqlDiagnostic.paginationProblem = problem;
      // Posts without valid continuation metadata are an incomplete response,
      // not proof of exhaustion. Group retries use its existing recovery budget.
      const incomplete = type === 'group' && graphqlDiagnostic?.usablePosts &&
        ['HAS_NEXT_PAGE_INVALID', 'END_CURSOR_MISSING'].includes(problem);
      return new FacebookFeedError(incomplete ? 'FACEBOOK_PAGINATION_INCOMPLETE' : 'PAGINATION_ERROR',
        message, { category: 'pagination', retryable: !!incomplete });
    };
    try {
      for (let page = 0; page < maxPages; page++) {
        if (seen.has(next)) throw paginationError('Facebook repeated a cursor');
        seen.add(next);
        variables.cursor = next;
        variables.count = Math.min(pageSize, numberPosts - result.size);
        form.variables = JSON.stringify(variables);
        if (page > 0) await sleep(delayMs);
        let response;graphqlDiagnostic=null;
        try { pagesFetched++; response = await request(form, headers, jar, agent); }
        catch (error) { throw classifyTransportError(error, !!proxy); }
        const httpError = responseError(response);
        if (httpError) throw httpError;
        let chunks;
        try { chunks = parseChunks(response.text); }
        catch {
          throw new FacebookFeedError('INVALID_RESPONSE',
            'Facebook returned non-JSON or truncated data; the cause is unknown', { retryable: true });
        }
        const errors = chunks.flatMap(c => c.errors ?? []);
        const feed = findFeed(mergeChunks(chunks), type);
        const usablePosts = feed?.edges?.some(e => e.node?.post_id);
        graphqlDiagnostic={feedPresent:!!feed,usablePosts:!!usablePosts,feedEdges:feed?.edges?.length||0,streamFinal:chunks.findLast(c=>typeof c.extensions?.is_final==='boolean')?.extensions.is_final??null,pageInfoPresent:!!feed&&Object.hasOwn(feed,'page_info'),pageInfoType:feed?.page_info===null?'null':typeof feed?.page_info,hasNextPage:typeof feed?.page_info?.has_next_page==='boolean'?feed.page_info.has_next_page:null,hasNextPageType:typeof feed?.page_info?.has_next_page,cursorPresent:typeof feed?.page_info?.end_cursor==='string'&&feed.page_info.end_cursor.length>0,errors:errors.slice(0,20).map(e=>({code:/^\d{1,12}$/.test(String(e.code??''))?String(e.code):null,kind:graphqlError([e],{unknownIsFatal:false})?.code||'FIELD_ERROR',path:Array.isArray(e.path)?e.path.slice(0,30).map(x=>Number.isSafeInteger(x)&&x>=0?x:typeof x==='string'&&/^[A-Za-z_][A-Za-z_0-9]{0,79}$/.test(x)?x:'field'):null}))};
        const knownError = graphqlError(errors, { unknownIsFatal: false });
        // Permission errors on an optional field do not prove the target is unavailable.
        if (knownError && (knownError.code !== 'TARGET_UNAVAILABLE' || !usablePosts)) throw knownError;
        if (!feed || !Array.isArray(feed.edges)) {
          throw graphqlError(errors) ?? new FacebookFeedError('FEED_UNAVAILABLE',
            `No usable ${type} feed returned; target access and query validity are unknown`, { category: 'target' });
        }
        if (errors.length && !feed.edges.some(e => e.node?.post_id)) throw graphqlError(errors);
        if (errors.length) warnings.push({ code: 'FACEBOOK_FIELD_ERRORS', count: errors.length,
          message: 'Facebook returned posts with field errors; some values may be missing' });
        const before = result.size;
        const candidate = new Map(result);
        let consumedCursor = null, consumedIndex = -1;
        for (let index = 0; index < feed.edges.length; index++) {
          const edge = feed.edges[index];
          if (!edge.node?.post_id) continue;
          const post = normalizePost(edge.node, { groupId, type, edge });
          candidate.set(post._id, post);
          consumedCursor = edge.cursor ?? null;
          consumedIndex = index;
          if (candidate.size === numberPosts) break;
        }
        const info = feed.page_info;
        if (candidate.size === numberPosts) {
          const remaining = feed.edges.slice(consumedIndex + 1).some(e => e.node?.post_id);
          if (remaining && !consumedCursor) throw paginationError('No edge cursor to resume without skipping posts');
          if (!remaining && typeof info?.has_next_page !== 'boolean') throw paginationError('Facebook omitted pagination information', 'HAS_NEXT_PAGE_INVALID');
          const continuation = remaining ? consumedCursor : info.has_next_page ? info.end_cursor : null;
          if ((typeof continuation !== 'string' || !continuation) && (remaining || info?.has_next_page)) throw paginationError('Facebook omitted next cursor', remaining ? null : 'END_CURSOR_MISSING');
          for (const [id, post] of candidate) result.set(id, post);
          next = continuation;
          return success(!!next);
        }
        if (typeof info?.has_next_page !== 'boolean') throw paginationError('Facebook omitted pagination information', 'HAS_NEXT_PAGE_INVALID');
        if (!info.has_next_page) {
          for (const [id, post] of candidate) result.set(id, post);
          next = null;
          return success(false);
        }
        if (candidate.size === before && feed.edges.some(e => e.node?.post_id)) {
          throw paginationError('Facebook returned only duplicate posts');
        }
        if (typeof info.end_cursor !== 'string' || !info.end_cursor) throw paginationError('Facebook omitted next cursor', 'END_CURSOR_MISSING');
        for (const [id, post] of candidate) result.set(id, post);
        next = info.end_cursor;
      }
      // Return a valid continuation when the configured request budget is reached.
      return success(true, true);
    } catch (error) {
      const classified = error instanceof FacebookFeedError ? error :
        new FacebookFeedError('UNEXPECTED_ERROR', 'Unexpected local parsing or processing error', { category: 'internal' });
      classified.context = { type, groupId, groupName,...(graphqlDiagnostic?{graphql:graphqlDiagnostic}:{}) };
      if(graphqlDiagnostic){const codes=[...new Set(graphqlDiagnostic.errors.map(x=>x.code).filter(Boolean))];if(codes.length===1)classified.sourceCode=codes[0];classified.stage ||= form.fb_api_req_friendly_name;}
      // Only committed pages are included; cursor resumes from the failed page.
      classified.partialResult = { posts: [...result.values()], cursor: next };
      throw classified;
    } finally {
      agent?.destroy();
    }
  };
}

export const fetchFacebookPosts = createFacebookPostFetcher();
export default fetchFacebookPosts;
