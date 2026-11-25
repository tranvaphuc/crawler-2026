# Facebook posts function

Node.js 20+, ESM. Uses the existing `https-proxy-agent` dependency and parser in
`paginate_facebook_group_capture.js`.

```js
import { createFacebookPostFetcher } from './facebook_posts.js';

const fetchFacebookPosts = createFacebookPostFetcher({
  harPaths: {
    group: '/absolute/path/to/group-capture.har',
    // page: '/absolute/path/to/page-timeline-capture.har',
    // user: '/absolute/path/to/user-timeline-capture.har',
  },
});

const { posts, cursor } = await fetchFacebookPosts({
  groupId: '1545294632435900',
  groupName: 'Group name',
  cursor: null,
  numberPosts: 50,
  proxy: null, // or 'http://username:password@host:port'
  type: 'group',
});

// Continue with exactly the same groupId and type:
if (cursor) {
  const next = await fetchFacebookPosts({
    groupId: '1545294632435900', groupName: 'Group name',
    cursor, numberPosts: 50, proxy: null, type: 'group',
  });
}
```

Alternatively import the default function and set `FACEBOOK_FEED_HAR_GROUP`,
`FACEBOOK_FEED_HAR_PAGE`, `FACEBOOK_FEED_HAR_USER`, or fallback `FACEBOOK_FEED_HAR`.
The optional `harPath` call parameter overrides configuration.

Output: `{ ok: true, status, posts: [{ _id, authorId, author, content, title,
description, like, shares, comment, url }], cursor, hasNextPage, warnings }`.

- `groupId` is a string ID for the group, page or user selected by `type`.
- `groupName` is caller metadata; it is not substituted for the post title/author.
- `numberPosts` is the maximum number of unique posts returned. If a response
  contains extra posts, continuation uses the last consumed edge cursor.
- `cursor: null` in the result means the feed ended. At the default 100-request
  budget, fewer posts may be returned with a continuation cursor.
- Counts are exact numeric fields. `like` means the Like reaction only.
  Missing exact counts are `null`, not fabricated zeroes. Missing title/description
  are empty strings. Anonymous/non-numeric author IDs remain as supplied by Facebook.
- Group URLs use `/groups/{groupId}/posts/{_id}/`; page/user URLs use
  `/{groupId}/posts/{_id}/`.
- Only HTTP/HTTPS proxies are supported, as a URL string or an object containing
  `host`, `port`, optional `protocol`, `username`, `password`.
- Uses anonymous request tokens from a real HAR; does not replay login cookies.
  Tokens/doc IDs may expire. Login/transport failures throw, with no automatic retry.
- Group, page and user modes have been verified live. Page/user modes require a
  matching timeline HAR; the captured group query cannot fetch their timelines.
  Live checks used `ProfileCometTimelineFeedRefetchQuery` for both NASA's Page
  (`100044561550831`) and Mark Zuckerberg's public user profile (`4`). Each
  returned 3 posts followed by 3 new posts using the returned cursor, with the
  expected author ID on all 6 posts. This does not guarantee access to other
  profiles or private posts.
- Each invocation has separate headers, variables, cookie jar and proxy agent.
  No files are written by the function.

Tests: `node --test test/facebook-posts.test.mjs`.

## Verified page/user configuration on this workspace

```js
const fetchPosts = createFacebookPostFetcher({
  harPaths: {
    group: '/Users/phuctran/Downloads/www.facebook.com.har',
    page: '/Users/phuctran/Downloads/www.facebook.com_page.har',
    user: '/Users/phuctran/Downloads/www.facebook.com_user.har',
  },
});

const nasa = await fetchPosts({
  groupId: '100044561550831', groupName: 'NASA',
  type: 'page', numberPosts: 3, cursor: null, proxy: null,
});
const zuck = await fetchPosts({
  groupId: '4', groupName: 'Mark Zuckerberg',
  type: 'user', numberPosts: 3, cursor: null, proxy: null,
});
```

Saved results: `outputs/facebook-page-user-live-check/page-nasa.json`,
`user-zuck.json`, and `summary.json`. These tests use anonymous public feeds.

## Empty feeds and errors

A successful response always has `ok: true`. Failures throw `FacebookFeedError`;
they never masquerade as `{ posts: [] }`.

| Status | Meaning |
| --- | --- |
| `OK` | Requested post count reached, more pages exist. |
| `EMPTY` | Initial feed returned no posts, no next page, and no blocking GraphQL error. Means no posts visible to this request, not proof the entity has never posted. |
| `END_OF_FEED` | No next page, including a continuation request with no remaining posts. |
| `PARTIAL` | Request budget reached before requested count; `cursor` can continue. May have zero posts if intermediate windows contain no posts. |

On success, `cursor: null` and `hasNextPage: false` mean no more pages.
`warnings` reports nonfatal Facebook field errors on otherwise usable posts.

Every `FacebookFeedError` provides `code`, `category`, `retryable`,
`retryWithDifferentProxy`, `retryAfterMs`, `httpStatus`, `stage`, `sourceCode`,
`context`, and `partialResult`. Use `error.toJSON()` to serialize it. Messages
do not echo proxy credentials or raw transport exceptions.

| Error code | Handling |
| --- | --- |
| `PROXY_CONNECT_FAILED`, `PROXY_TIMEOUT` | Confirmed failure before proxy CONNECT succeeded. Retry with a different proxy. |
| `PROXY_AUTH_REQUIRED` | Proxy returned 407; correct credentials or use another proxy. |
| `PROXY_TUNNEL_REJECTED` | Proxy rejected CONNECT; may use another proxy. |
| `INVALID_PROXY` | Fix proxy configuration, do not blindly retry. |
| `NETWORK_ERROR`, `NETWORK_TIMEOUT` | Retryable transport issue with uncertain cause or after tunnel establishment. Not automatically attributed to proxy. |
| `FACEBOOK_RATE_LIMITED` | Wait/back off; honor `retryAfterMs` if supplied. `retryWithDifferentProxy: false`. |
| `FACEBOOK_SERVER_ERROR` | Facebook 5xx after CONNECT success; retry later. |
| `AUTH_REQUIRED`, `SECURITY_CHECKPOINT` | Resolve access/security check; do not automatically retry/rotate proxy. |
| `TARGET_UNAVAILABLE` | Explicit unavailable/permission error: may be missing, private, restricted, or inaccessible. These cannot reliably be distinguished. |
| `FEED_UNAVAILABLE` | No usable feed and no specific error; access/query validity unknown. This is not an empty success. |
| `FACEBOOK_ACCESS_DENIED` | Facebook HTTP 403; not sufficient evidence the target is private or nonexistent. |
| `REQUEST_TOKEN_INVALID`, `REQUEST_TEMPLATE_INVALID` | Refresh/fix captured request tokens or template. |
| `INVALID_CURSOR` | Check cursor source/type or restart explicitly with `null`. |
| `PAGINATION_ERROR` | Missing/repeated cursor or malformed pagination; inspect response/template. |
| `INVALID_RESPONSE` | Invalid/truncated non-JSON response; retryable, cause unknown. |
| `FACEBOOK_GRAPHQL_ERROR`, `FACEBOOK_HTTP_ERROR` | Unclassified Facebook failure, inspect before retrying. |
| `INVALID_ARGUMENT`, `UNEXPECTED_ERROR` | Input or local processing problem. |

Unknown GraphQL failures are not guessed to be proxy errors or missing targets.
HTTP 404 on `/api/graphql/` is a request/endpoint failure, not evidence that a
profile ID is missing.

```js
import { FacebookFeedError } from './facebook_posts.js';

try {
  const result = await fetchPosts(options);
  console.log(result.status, result.posts, result.cursor);
} catch (error) {
  if (!(error instanceof FacebookFeedError)) throw error;
  console.log(error.toJSON());
  if (error.retryWithDifferentProxy) {
    // Caller chooses the next proxy and controls retry count/backoff.
    // Persist error.partialResult.posts first, then resume from its cursor.
  } else if (error.retryable) {
    // Retry later, respecting retryAfterMs when present.
  }
}
```

For failures during pagination, `partialResult` contains only fully accepted
pages and a cursor pointing to the failed page. Keep those posts and request
`numberPosts - partialResult.posts.length` on retry. Deduplicate by `_id` when
combining results. Setup/input errors have `partialResult: null`; reuse the
original cursor if retrying after correcting configuration.

## Ordering and request budget update

The fetcher factory defaults to `pageSize:50` (1..100), replacing count=3 to reduce requests. Group requests use the captured `sortingSetting:CHRONOLOGICAL`. Returned rows are sorted by exact created_time descending within the returned page; `ordering.scope` makes that scope explicit and `serverFilterVerified` remains false until the response proves it. Pinned posts can still affect traversal; local sorting does not prove the whole source is globally newest. Existing page/user live samples above predate this update; this pass has regression coverage but no fresh HAR-backed live verification. `requests` reports pagesFetched.
