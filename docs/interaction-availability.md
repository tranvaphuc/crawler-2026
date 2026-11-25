# Interaction API: identity and availability

`POST /api/social/post/metrics` returns HTTP 200 for a completed upstream check. Inspect `status`, `identityVerified`, and the nullable `metrics` fields before consuming measurements. A `partial` result means some exact counters were returned; it does not mean every requested counter is public.

## Facebook video binding

The reader reconstructs initial and deferred primary Hero projections. Video feedback is accepted only when the primary media ID and its creation Story ID agree. An incomplete story summary can be supplemented by media feedback with the same feedback ID. Other videos, shared originals, recommendations, and conflicting patches cannot supply counters.

Direct watch/video/reel URLs can identify the requested media without asserting an unknown canonical Page alias. These metrics results use the media ID as `nativeId` and expose `nativePostId` separately. Post/source information readers continue to require canonical source verification.

Exact zero remains zero. Missing counts remain null. `play_count` is not a fallback for Facebook `views`. Exact native reaction, comment, share and view variants are supported; conflicting exact values are withheld.

Facebook's rendered comment list and `total_comment_count` can report different populations. `metrics.comment` retains the rendered public-list count when available. The separate native total is exposed in `extraMetrics["primary_feedback.total_comment_count"]` and post-info's `interactions.nativeTotalCommentCount`. The native total is used as the main comment-count fallback only when the public-list count is absent.

If a numeric owner/post URL returns no verifiable primary post, the runtime makes at most one additional numeric-permalink attempt within the API deadline. HTTP, authentication, checkpoint and rate failures stop that fallback. Requests continue to use the API-reserved proxy provider.

## Reasons without usable counters

| Reason | Meaning |
| --- | --- |
| `PUBLIC_COUNTERS_NOT_RETURNED` | The post identity was verified, but no usable public counters were returned. |
| `POST_ID_UNVERIFIED` | The anonymous response did not verify the requested post. |
| `ANONYMOUS_POST_DATA_NOT_RETURNED` | Facebook returned a login bootstrap without a verified requested post. This does not establish deletion or privacy. |
| `POST_IDENTITY_MISMATCH` | A primary Facebook post did not match the requested ID. Album counters are not substituted for a photo ID. |
| `CONFLICTING_PRIMARY_POST_DATA` | Primary deferred projections disagreed on identity or exact counters. |
| `POST_NOT_PUBLIC` | YouTube's native player explicitly reported a private video requiring sign-in. |
| `POST_UNAVAILABLE` | Native HTTP 404/410 or a Threads `invalid_post` redirect. |

Small `accessEvidence` objects explain native login bootstrap, player playability or invalid-post redirects. They contain no HTML, cookies or tokens. A post-specific private-video response or a generic Facebook login invitation does not classify the entire proxy as invalid.

Callers should retain existing measurements when a new value is null. Do not replace null with zero or assume every unavailable result can be fixed by immediate retries. A malformed Threads display-name URL still returns HTTP 400; the API does not guess a username.

## Verification

Run `npm run test:apis` for parser, identity, admission, transport, proxy and HTTP contract regressions. The focused fixtures cover deferred video feedback, direct media routes, Reels, mismatched album/photo IDs, missing/zero/conflicting counts and native availability responses.

`node scripts/audit_interaction_cohort.mjs <input.json> <output.json>` checks a supplied URL list with two workers. It uses the configured authenticated public API, saves atomic checkpoints, and stops new requests for a platform after an explicit auth, checkpoint or rate gate. It does not mutate crawler jobs or stored measurements.
