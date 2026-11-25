/** Comment/reply reader. Node 20+, ESM. One Facebook page per function call. */
import { readFile } from 'node:fs/promises';
import {facebookCommentAuthorIdentity,collectFacebookCommentAuthorIdentities} from '../src/services/facebookAuthorIdentity.js';
import { createProxyAgent } from './facebook_posts.js';
import { post, parseChunks, mergeChunks } from './paginate_facebook_group_capture.js';
import { FacebookFeedError, inputError, templateError, classifyTransportError,
  responseError, graphqlError } from './facebook_post_errors.js';
export { FacebookFeedError } from './facebook_post_errors.js';

// Read from the public comment UI's Relay artifacts on 2026-10-20.
// Overridable at construction because Facebook may change these operations.
// Native All comments selected in an anonymous proxied Chrome capture on 2026-10-24.
// Roots can be ranked: callers must collect pages before claiming global oldest order.
export const DEFAULT_COMMENT_INTENT='RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1';
const UNFILTERED_INTENTS=new Set([DEFAULT_COMMENT_INTENT,'CHRONOLOGICAL_UNFILTERED_INTENT_V1']);
export const COMMENT_QUERIES = Object.freeze({
  initial: { name: 'CommentListComponentsRootQuery', docId: '29409681848615704' },
  comments: { name: 'CommentsListComponentsPaginationQuery', docId: '29265821953021786' },
  replies: { name: 'Depth1CommentsListPaginationQuery', docId: '29170168959337360' },
});
const flags = {
  __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
  __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
  __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
  __relay_internal__pv__IsWorkUserrelayprovider: false,
};
const numericCount = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
const feedbackId = (postId, commentId) => Buffer.from(
  `feedback:${commentId === postId ? postId : `${postId}_${commentId}`}`).toString('base64');
const validFeedbackId = value => typeof value === 'string' && value.length <= 4096 &&
  /^feedback:(?:\d+(?:_\d+)?|pfbid[A-Za-z0-9]+)$/.test(Buffer.from(value, 'base64').toString('utf8'));

function numericId(value, name) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value)) ||
      (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw inputError(`${name} must be a numeric Facebook ID; pass long IDs as strings`);
  }
  return String(value);
}

function commentId(node) {
  if (node.legacy_fbid != null) return String(node.legacy_fbid);
  if (/^\d+$/.test(String(node.id))) return String(node.id);
  if (typeof node.id === 'string') {
    const decoded = Buffer.from(node.id, 'base64').toString('utf8');
    const match = /^comment:\d+_(\d+)$/.exec(decoded);
    if (match) return match[1];
  }
  return null;
}

export function normalizeComment(node, { idPost, idGetComment, authorIdentities, sourceType }) {
  const id = commentId(node);
  if (!id) throw new FacebookFeedError('INVALID_COMMENT_RESPONSE', 'Comment is missing a usable ID');
  const feedback = node.feedback ?? {};
  const anonymousGroupAuthor=sourceType==='group'&&[
    node.author?.__typename,
    node.comet_comment_author_name_and_badges_renderer?.comment?.author?.__typename,
  ].includes('GroupAnonAuthorProfile');
  const authorIdentity=anonymousGroupAuthor
    ?{id:idPost,opaqueId:null,profileUrl:null,evidence:'response.group_anonymous_post_id'}
    :facebookCommentAuthorIdentity(node,authorIdentities);
  const totalReactions = numericCount(typeof feedback.reaction_count === 'number' ? feedback.reaction_count : feedback.reaction_count?.count);
  const reactions = feedback.top_reactions;
  const like = reactions?.edges?.find(edge => String(edge.node?.id) === '1635855486666999');
  const allReactions = Number.isInteger(reactions?.count) && reactions.count === reactions.edges?.length;
  const replyCount = feedback.replies_fields?.total_count ?? feedback.replies_fields?.count ??
    feedback.total_reply_count ?? node.replies_fields?.total_count;
  return {
    _id: id, idPost, parentId: idGetComment,
    authorId:authorIdentity.id,authorOpaqueId:authorIdentity.opaqueId,authorUrl:authorIdentity.profileUrl,authorIdEvidence:authorIdentity.evidence,author: anonymousGroupAuthor?(node.author?.name||node.author?.nickname||'anonymous'):node.author?.name ?? null,
    content: node.body?.text ?? node.preferred_body?.text ?? '',
    reactions: totalReactions,
    created_time: node.created_time ?? null,
    time: node.created_time == null ? null : new Date(node.created_time * 1000).toISOString(),
    like: like ? numericCount(like.reaction_count) :
      allReactions || totalReactions === 0 ? 0 : null,
    repliesCount: numericCount(replyCount),
    url: feedback.url ?? node.url ?? `https://www.facebook.com/${idPost}?comment_id=${id}`,
    attachments: node.attachments ?? [],
  };
}

export function encodeCommentCursor(context) {
  return 'fbcomments.v1.' + Buffer.from(JSON.stringify(context)).toString('base64url');
}

export function decodeCommentCursor(cursor, { idPost, idGetComment, authorIdentities }) {
  try {
    if (typeof cursor !== 'string' || cursor.length > 65536 || !cursor.startsWith('fbcomments.v1.')) throw 0;
    const context = JSON.parse(Buffer.from(cursor.slice('fbcomments.v1.'.length), 'base64url').toString());
    if (context.idPost !== idPost || context.idGetComment !== idGetComment ||
        !['after', 'before'].includes(context.direction) ||
        !(typeof context.after === 'string' && context.after ||
          context.after === null && context.bootstrap === true) ||
        typeof context.feedLocation !== 'string' || context.feedLocation.length > 128 ||
        (context.feedbackId != null && !validFeedbackId(context.feedbackId)) ||
        !['commentsIntentToken', 'clientKey', 'expansionToken'].every(key =>
          context[key] == null || typeof context[key] === 'string')) throw 0;
    return context;
  } catch {
    throw new FacebookFeedError('INVALID_CURSOR',
      'Use the cursor returned for the same idPost and idGetComment', { category: 'pagination' });
  }
}

async function requestBase(harPath) {
  try {
    const har = JSON.parse(await readFile(harPath, 'utf8'));
    const entries = har.log?.entries?.filter(e =>
      e.request?.url === 'https://www.facebook.com/api/graphql/' && e.request.postData?.text);
    const entry = entries?.at(-1);
    if (!entry) throw 0;
    const form = Object.fromEntries(new URLSearchParams(entry.request.postData.text));
    form.__user = '0'; form.av = '0';
    for (const key of ['fb_dtsg', 'access_token']) delete form[key];
    if (!form.lsd || Object.values(form).includes('[REDACTED]')) throw 0;
    const excluded = new Set(['host', 'content-length', 'accept-encoding', 'connection',
      'cookie', 'authorization', 'x-fb-navigation-chain']);
    const headers = Object.fromEntries(entry.request.headers.filter(h =>
      !h.name.startsWith(':') && !excluded.has(h.name.toLowerCase()))
      .map(h => [h.name.toLowerCase(), h.value]));
    let captured={};try{captured=JSON.parse(form.variables||'{}');}catch{}
    const relayFlags=Object.fromEntries(Object.entries(flags).map(([k,fallback])=>[k,typeof captured[k]===typeof fallback?captured[k]:fallback]));
    return { form, headers, relayFlags };
  } catch {
    throw templateError('Configure an original HAR containing an anonymous Facebook GraphQL request');
  }
}

export function createFacebookCommentFetcher({ harPath, request = post, pageSize = 20,
  feedLocation = null, queries = {}, commentsIntentToken = DEFAULT_COMMENT_INTENT,
  requireIntentMatch = true, nativePaginationDefaults = true, onResponse } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw inputError('pageSize must be an integer from 1 to 100');
  }
  const operations = { ...COMMENT_QUERIES, ...queries };
  let basePromise;
  for (const operation of Object.values(operations)) {
    if (!operation || typeof operation.name !== 'string' || !/^\d+$/.test(operation.docId)) {
      throw templateError('Each query needs a name and numeric docId');
    }
  }
  return async function fetchFacebookComments(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw inputError('Options must be an object');
    const idPost = numericId(options.idPost, 'idPost');
    const idGetComment = numericId(options.idGetComment ?? idPost, 'idGetComment');
    const cursor = options.cursor ?? null, proxy = options.proxy ?? null;
    const mode = idPost === idGetComment ? 'comments' : 'replies';
    const context = cursor === null ? { idPost, idGetComment, after: null, direction: 'after',
      commentsIntentToken, clientKey: null, expansionToken: null,
      feedLocation: feedLocation || (options.sourceType === 'group' ? 'GROUP_PERMALINK' : 'POST_PERMALINK_DIALOG') } :
      decodeCommentCursor(cursor, { idPost, idGetComment });
    const source = harPath ?? process.env.FACEBOOK_COMMENTS_HAR ?? process.env.FACEBOOK_FEED_HAR;
    if (!source) throw templateError('Set FACEBOOK_COMMENTS_HAR or configure harPath');
    basePromise ??= requestBase(source).catch(error => { basePromise=null; throw error; });
    const base = await basePromise;
    const form = {...base.form}, headers = {...base.headers};
    let agent;
    try { agent = createProxyAgent(proxy); }
    catch { throw new FacebookFeedError('INVALID_PROXY', 'Invalid HTTP/HTTPS proxy configuration', { category: 'config' }); }
    const initial = mode === 'comments' && cursor === null;
    const operation = initial ? operations.initial : operations[mode];
    const variables = { ...base.relayFlags, feedLocation: context.feedLocation,
      focusCommentID: options.focusCommentId==null?null:numericId(options.focusCommentId,'focusCommentId'), id: context.feedbackId || feedbackId(idPost, idGetComment), scale: 2, useDefaultActor: false };
    if (mode === 'comments') {
      variables.commentsIntentToken = context.commentsIntentToken;
      if (initial) variables.feedbackSource = 2;
      else {
        variables.commentsAfterCount = context.direction === 'after' ? (nativePaginationDefaults ? -1 : pageSize) : null;
        variables.commentsAfterCursor = context.direction === 'after' ? context.after : null;
        variables.commentsBeforeCount = context.direction === 'before' ? pageSize : null;
        variables.commentsBeforeCursor = context.direction === 'before' ? context.after : null;
        variables.targetDialect = null;
      }
    } else {
      Object.assign(variables, { clientKey: context.clientKey, expansionToken: context.expansionToken,
        repliesAfterCount: context.direction === 'after' && context.after !== null ? pageSize : null,
        repliesAfterCursor: context.direction === 'after' ? context.after : null,
        repliesBeforeCount: context.direction === 'before' ? pageSize : null,
        repliesBeforeCursor: context.direction === 'before' ? context.after : null });
    }
    form.doc_id = operation.docId;
    form.fb_api_req_friendly_name = operation.name;
    form.variables = JSON.stringify(variables);
    headers['x-fb-friendly-name'] = operation.name;
    headers.referer = `https://www.facebook.com/${idPost}`;
    try {
      let response;
      try { response = await request(form, headers, new Map(), agent); }
      catch (error) { throw classifyTransportError(error, !!proxy); }
      const httpError = responseError(response);
      if (httpError) throw httpError;
      let chunks;
      try { chunks = parseChunks(response.text); }
      catch { throw new FacebookFeedError('INVALID_RESPONSE', 'Invalid or truncated Facebook comment response', { retryable: true }); }
      const root = mergeChunks(chunks), feedback = root.node;
      const authorIdentities=collectFacebookCommentAuthorIdentities(chunks,root);
      const connection = mode === 'comments'
        ? feedback?.comment_rendering_instance_for_feed_location?.comments
        : feedback?.replies_connection;
      const usable = connection?.edges?.some(e => e.node && commentId(e.node));
      const errors = chunks.flatMap(c => c.errors ?? []);
      const known = graphqlError(errors, { unknownIsFatal: false });
      if (known && (known.code !== 'TARGET_UNAVAILABLE' || !usable)) {known.httpStatus=response.status;known.sourceCode=errors.find(e=>graphqlError([e],{unknownIsFatal:false})?.code===known.code)?.code??null;throw known;}
      if (!connection || !Array.isArray(connection.edges)) {
        throw graphqlError(errors) ?? new FacebookFeedError('COMMENTS_UNAVAILABLE',
          'Facebook did not return a usable comment/reply connection; access or query context may be missing', { category: 'target' });
      }
      const connectionErrors = errors.filter(e => !Array.isArray(e.path) ||
        e.path.length < 2 || e.path.some(p => /comments|replies/i.test(String(p))));
      // Group feature-intervention renderer errors do not affect native comment nodes/counts/cursors, even when nested under a comment feedback object.
      const coverageErrors=connectionErrors.filter(e=>!Array.isArray(e.path)||!e.path.includes('associated_group'));
      if (coverageErrors.length && !usable) throw graphqlError(coverageErrors);
      // Facebook may return an opaque feedback ID for the requested numeric ID.
      // Parse this connection using the post/comment IDs supplied in the request.
      const info = connection.page_info;
      if (typeof info?.has_next_page !== 'boolean' || typeof info?.has_previous_page !== 'boolean') {
        throw new FacebookFeedError('PAGINATION_ERROR', 'Comment pagination information is missing', { category: 'pagination' });
      }
      if ((cursor === null || context.bootstrap === true && context.after === null) && !info.has_next_page && info.has_previous_page) context.direction = 'before';
      const hasNextPage = context.direction === 'after' ? info.has_next_page : info.has_previous_page;
      const next = context.direction === 'after' ? info.end_cursor : info.start_cursor;
      if (mode === 'replies' && !usable && !hasNextPage && context.expansionToken == null &&
          feedback.replies_fields?.total_count !== 0 && feedback.replies_fields?.count !== 0 && connection.total_count !== 0) {
        throw new FacebookFeedError('REPLY_CONTEXT_REQUIRED',
          'Empty reply response cannot confirm no replies; pass the parent comment replyCursor as cursor',
          { category: 'pagination' });
      }
      if (hasNextPage && (!next || next === context.after)) {
        throw new FacebookFeedError('PAGINATION_ERROR', 'Comment cursor is missing or repeated', { category: 'pagination' });
      }
      const selectedIntent = feedback.comment_rendering_instance_for_feed_location?.selected_intent?.intent_token;
      if (mode === 'comments' && requireIntentMatch &&
          (initial ? selectedIntent !== commentsIntentToken :
            context.commentsIntentToken !== commentsIntentToken || selectedIntent != null && selectedIntent !== commentsIntentToken)) {
        throw new FacebookFeedError('COMMENT_SORT_UNAVAILABLE',
          'Facebook did not confirm the requested comment sorting mode', {category:'target'});
      }
      context.commentsIntentToken = selectedIntent ?? context.commentsIntentToken;
      if (validFeedbackId(feedback.id)) context.feedbackId = feedback.id;
      // A focused initial page can have earlier and later comments. Traverse both sides.
      const firstReplyPage=mode==='replies'&&(cursor===null||context.bootstrap===true&&context.after===null);
      const alternateCursor = (initial||firstReplyPage) && info.has_next_page && info.has_previous_page && info.start_cursor
        ? encodeCommentCursor({...context, direction:'before', after:info.start_cursor}) : null;
      if (connection.edges.some(e => e.node && !commentId(e.node))) {
        throw new FacebookFeedError('INVALID_COMMENT_RESPONSE', 'A returned comment has no usable ID');
      }
      const comments = [...new Map(connection.edges.filter(e => e.node && commentId(e.node))
        .map(e => { const item = normalizeComment(e.node, { idPost, idGetComment, authorIdentities, sourceType:options.sourceType }); return [item._id, item]; })).values()];
      // Join author projections from this session's bootstrap before any worker
      // builds its DTO or enqueues an ES5 import, for roots and replies alike.
      await request.resolveResponseAuthors?.(comments);
      await onResponse?.({idPost,idGetComment,request:{operation:operation.name,docId:operation.docId,variables,cursor},response:{status:response.status,text:response.text}});
      // When supplied by Facebook, carry the parent's reply expansion context.
      // It can be passed as cursor for the first reply request, without shared cache.
      for (const edge of connection.edges) {
        const id = edge.node && commentId(edge.node);
        const replyFeedback = edge.node?.feedback;
        if (!id || !replyFeedback?.expansion_info?.expansion_token && !validFeedbackId(replyFeedback?.id)) continue;
        const item = comments.find(c => c._id === id);
        item.replyCursor = encodeCommentCursor({ idPost, idGetComment: id, after: null,
          bootstrap: true, direction: 'after', commentsIntentToken: context.commentsIntentToken,
          clientKey: null, expansionToken: replyFeedback.expansion_info?.expansion_token || null,
          ...(validFeedbackId(replyFeedback.id) ? {feedbackId: replyFeedback.id} : {}),
          feedLocation: context.feedLocation });
      }
      comments.sort((a,b)=>(a.created_time??Infinity)-(b.created_time??Infinity));
      return { ok: true, ordering:{requested:'oldest',verified:comments.every(c=>c.created_time!==null),scope:'returned_page',unfilteredVerified:mode==='comments'&&UNFILTERED_INTENTS.has(context.commentsIntentToken)},
      coverage:{scope:'anonymous_public_response',complete:false,pageExhausted:!hasNextPage&&!alternateCursor,allRepliesFetched:false}, status: hasNextPage ? comments.length ? 'OK' : 'PARTIAL' :
        comments.length || cursor !== null ? 'END_OF_FEED' : 'EMPTY',
      mode, comments, commentsIntentToken:context.commentsIntentToken,
      totalCount:numericCount(connection.total_count), alternateCursor,
      cursor: hasNextPage ? encodeCommentCursor({ ...context, after: next }) : null,
      hasNextPage, warnings: errors.length ? [{ code: 'FACEBOOK_FIELD_ERRORS', count: errors.length, coverageAffected: coverageErrors.length > 0 }] : [] };
    } catch (error) {
      const failure = error instanceof FacebookFeedError ? error : new FacebookFeedError(
        'UNEXPECTED_ERROR', 'Unexpected local comment processing error', { category: 'internal' });
      failure.stage ||= operation.name;
      failure.context = { ...failure.context,idPost, idGetComment, mode };
      failure.partialResult = { comments: [], cursor };
      throw failure;
    } finally { agent?.destroy(); }
  };
}

export const fetchFacebookComments = createFacebookCommentFetcher();
export default fetchFacebookComments;
