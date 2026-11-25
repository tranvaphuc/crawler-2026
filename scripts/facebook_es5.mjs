import { createFacebookPostFetcher } from './facebook_posts.js';
import { createFacebookCommentFetcher } from './facebook_comments.js';
import { getFacebookPostDetails } from '../src/services/facebookShare.js';
import { facebookPostsToEs5, facebookCommentsToEs5 } from '../src/services/facebookEs5.js';
export * from '../src/services/facebookEs5.js';

export function createFacebookEs5PostFetcher(config) {
  const fetch = createFacebookPostFetcher(config);
  return async function(options, context) {
    const raw = await fetch(options);
    const source = context?.source || { type: options.type, id: options.groupId, name: options.groupName };
    return { ...facebookPostsToEs5(raw.posts, { ...context, source, flow: 'source' }),
      cursor: raw.cursor, hasNextPage: raw.hasNextPage, upstreamStatus: raw.status, upstreamWarnings: raw.warnings };
  };
}
export async function fetchFacebookPostDetailEs5(input, context, dependencies) {
  const raw = await getFacebookPostDetails(input, dependencies);
  if (!raw.ok || !raw.post) return { ok: false, format: 'es5', documents: [], rejected: [{ reason: raw.reason }], warnings: [] };
  return facebookPostsToEs5([raw.post], { ...context, flow: 'detail' });
}
export function createFacebookEs5CommentFetcher(config) {
  const fetch = createFacebookCommentFetcher(config);
  return async function(options, context) {
    const raw = await fetch(options);
    return { ...facebookCommentsToEs5(raw.comments, context), cursor: raw.cursor, alternateCursor: raw.alternateCursor,
      hasNextPage: raw.hasNextPage, upstreamStatus: raw.status, upstreamWarnings: raw.warnings };
  };
}
