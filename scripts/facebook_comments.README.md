# Comment and reply function

```js
import { createFacebookCommentFetcher } from './facebook_comments.js';

const getComments = createFacebookCommentFetcher({
  harPath: '/Users/phuctran/Downloads/www.facebook.com_page.har',
  pageSize: 20,
});

// Top-level comments: idGetComment equals the post ID.
const first = await getComments({
  idPost: '1658876782274358',
  idGetComment: '1658876782274358',
  cursor: null,
  proxy: null, // or 'http://user:password@host:port'
});

// Next comment page. Keep the same IDs.
if (first.cursor) {
  const next = await getComments({
    idPost: '1658876782274358', idGetComment: '1658876782274358',
    cursor: first.cursor, proxy: null,
  });
}

// Replies: idGetComment is the parent's numeric comment ID.
const parent = first.comments.find(comment => comment.repliesCount > 0);
if (parent) {
  const replies = await getComments({
    idPost: '1658876782274358',
    idGetComment: parent._id,
    // Carry expansion context when Facebook supplies it.
    cursor: parent.replyCursor ?? null,
    proxy: null,
  });
  // Continue with replies.cursor and the SAME idPost/idGetComment.
}
```

Alternatively import default `fetchFacebookComments` and set
`FACEBOOK_COMMENTS_HAR` (fallback: `FACEBOOK_FEED_HAR`). Requires Node.js 20+
and the repository's existing `https-proxy-agent` package. The implementation
uses the shared parser/transport in `paginate_facebook_group_capture.js`, proxy
configuration in `facebook_posts.js`, and `facebook_post_errors.js`.

Each call returns ONE response page:

```js
{
  ok: true,
  status: 'OK', // EMPTY / END_OF_FEED / PARTIAL
  mode: 'comments', // or 'replies'
  comments: [{
    _id, idPost, parentId, authorId, author, content,
    created_time, time, like, repliesCount, url, attachments,
    // replyCursor exists when Facebook supplies reply expansion context.
  }],
  cursor, hasNextPage, warnings,
}
```

- `idPost`, `idGetComment` must be numeric ID strings, not URLs or GraphQL IDs.
  An omitted `idGetComment` defaults to `idPost`.
- `_id` is the comment's legacy numeric ID, ready to use as `idGetComment`.
- `parentId` is `idPost` for root comments, or `idGetComment` for replies.
- UTC `time` is ISO 8601; `created_time` is Unix seconds.
- `like` is the exact Like reaction count, not total reactions. Unknown exact
  counts are `null`; absent text is an empty string.
- The initial comment query uses Facebook's default page size (currently the
  observed UI returns 10). `pageSize` sets continuation/reply request counts;
  Facebook may return fewer.
- The opaque cursor includes Facebook's native cursor, direction, IDs,
  selected comment intent and reply expansion context. Do not decode/rewrite it
  or reuse it across posts/parents. No shared in-memory cache is required.
- Reply calls may start with `cursor: null`. If Facebook needs expansion context,
  use the parent's `replyCursor`. An empty response without expansion context or
  an explicit zero count throws `REPLY_CONTEXT_REQUIRED` instead of falsely
  claiming there are no replies.
- Sorting follows the selected Facebook comment intent. The observed page uses
  "Most relevant"; filtered comments/replies may be omitted. This is not a
  guarantee of all comments or chronological ordering.
- Proxy URL strings and objects are supported exactly as for the post function.
- No cookies/auth headers from the HAR are replayed. No automatic retry, proxy
  rotation, or attempts to bypass login, security checks or rate limits occur.

## Errors

Same `FacebookFeedError` class and policy flags as `facebook_posts.js`:
`code`, `category`, `retryable`, `retryWithDifferentProxy`, `retryAfterMs`,
`httpStatus`, `stage`, `sourceCode`, `context`, `partialResult`.

Additional codes: `COMMENTS_UNAVAILABLE`, `INVALID_COMMENT_RESPONSE`,
`COMMENT_TARGET_MISMATCH`, `REPLY_CONTEXT_REQUIRED`. None means "no comments".
Only a valid empty, exhausted connection yields `EMPTY`. An intermediate
empty response with another page yields `PARTIAL` and a continuation cursor.
`partialResult` on request/parse failure is `{ comments: [], cursor: inputCursor }`;
already returned pages remain the caller's responsibility.

## Verification and current limitation

- Public Facebook bundles observed on the NASA post identify these operations:
  `CommentListComponentsRootQuery` (`29409681848615704`),
  `CommentsListComponentsPaginationQuery` (`29265821953021786`),
  `Depth1CommentsListPaginationQuery` (`29170168959337360`). Constructor option
  `queries` can override `{ initial, comments, replies }`, each `{ name, docId }`.
- The already loaded page's embedded public data confirms the root connection,
  comment IDs, forward cursors, selected intent and per-comment expansion tokens.
- On 2026-10-21, anonymous requests through the supplied proxies returned live
  comments and replies for posts in the September dataset. The first bulk
  checkpoint contained 89 root comments and 4 replies, with 14 posts completed.
  Other requests encountered rate limits/network errors and provider cooldowns.
- Tests: `node --test test/facebook-comments.test.mjs test/facebook-posts.test.mjs`.

## Continuous bulk job

`scripts/collect_facebook_comments_bulk.mjs` processes an input JSON array of
posts. It retains separate tasks/cursors for each post and reply parent, schedules
reply pagination when a parent reports replies, and deduplicates by post/comment
ID. Replies are not restricted to September: September only selects the input
posts. Zero results are accepted only from a valid empty comment connection.
Failures are retained as incomplete tasks/posts rather than counted as empty.

`scripts/facebook_comment_workers.mjs` prepares ten disjoint post shards from the
44,932 saved posts and uses the ten existing proxy key files. Each worker has a
zero artificial delay between requests, as requested by the user. Rate limits and transport failures
rotate the proxy, preserve the task cursor, honour Retry-After, and wait five
minutes after three consecutive failures. Provider cooldowns are honoured.
Login/security and invalid key/template/token errors stop that worker.

Outputs are under `outputs/facebook-comments-september-2026-10-21/workers/00`
through `09`: `comments.jsonl` contains root comments and replies distinguished by
`kind` and `parentId`; `post-status.jsonl` records completion/incomplete results;
`errors.jsonl` retains failed targets/cursors. `state.json` checkpoints the queue.
The output root contains `workers.json` and an aggregate `state.json`, refreshed
every 15 seconds by a separate background job. macOS jobs use RunAtLoad without
KeepAlive; the chat monitor can resume unexpectedly stopped jobs without creating
duplicates. Post-crawl jobs remain stopped.

The bulk job now explicitly requests `CHRONOLOGICAL_UNFILTERED_INTENT_V1`.
The initial response must confirm that exact token; a fallback raises
`COMMENT_SORT_UNAVAILABLE`. Continuation queries carry the confirmed token in the
cursor (those queries do not select `selected_intent`). Both earlier and later
pagination branches are queued when supplied. Every post is rescanned from the
start for this pass, preserving earlier records and deduplicating additions.
`unfiltered-verified.jsonl` records IDs encountered in the unfiltered pass;
`completedPosts` describes that pass, while comment/reply totals are cumulative.
Restricted, deleted or otherwise invisible comments may still be unavailable.

## Full comments and oldest defaults

The factory defaults to `commentsIntentToken:RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1` (native All comments captured on 2026-10-24) and `requireIntentMatch:true`. The root page must confirm that token or return COMMENT_SORT_UNAVAILABLE; it never silently switches to Most relevant. Continuations reuse the verified token when selected_intent is not echoed. Both cursor directions and reply pagination context are preserved. Rows are sorted oldest first by exact created_time **within the returned page**. The one-page helper does not prove globally oldest traversal or full replies: coverage.complete and allRepliesFetched remain false. On 2026-10-24, anonymous proxied Chrome confirmed the native All comments token, and HTTP replay through the same proxy returned 10 comments without an upstream error. Root order can be ranked; global oldest order requires collecting all public continuations before sorting by exact timestamps. Captured Relay flags are restricted to the known flag names; actor/target/cursor values are rebuilt for each request.
