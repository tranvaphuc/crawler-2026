# Facebook post share API

Anonymous, read-only HTML GET. No Facebook cookie, access token, HAR or GraphQL request replay required. Node.js 20+.

## Run

```sh
npm run api:facebook-share
```

Standalone server: `127.0.0.1:3804`. `FACEBOOK_SHARE_PORT` overrides the port. The same route is also mounted before Bull Board in `src/index.js`; rebuild/restart that application when deploying. The standalone server does not start Redis, queue producers or crawlers.

## Request

### Full available public post details from just an ID

```sh
curl http://127.0.0.1:3804/api/facebook/post/details \
  -H 'Content-Type: application/json' \
  -d '{"id":"1000419343151470_122138942931244237"}'
```

The same URL/id/input contract applies. Returns `post` with canonical compound ID, Page ID, Profile ID, author and URL, `content`, `createdTime` (Unix seconds), `createdAt` (UTC ISO), `authorUrl`, `interactions` (total reactions, likes, comments, shares, videoViews, reactionBreakdown), `media` (photo/video IDs, public URLs, dimensions, alt text, available duration/playback URL), `attachments`, `hashtags`, and `unavailableFields`. Also returns `isShare`, `originalPost`, and `shareDetection`.

These are the fields actually present in the verified primary anonymous response. Missing counts are `null`, never assumed zero; do not add reactionBreakdown to the total. Photo/video CDN URLs can expire. This endpoint does not paginate/export comments or replies, and does not promise hidden/restricted data. Video views/playback links are null when absent.

### Share check

```sh
curl http://127.0.0.1:3804/api/facebook/post/share \
  -H 'Content-Type: application/json' \
  -d '{"id":"61588342686925_122131613781278089"}'
```

Use exactly one string field: `id`, `url` or `input`. IDs must be strings to preserve precision. URL example:

```json
{"url":"https://www.facebook.com/permalink.php?story_fbid=pfbid02s74gb4fpAZtZqDvFj77zdhdrRbSrCHLcbudYgUdhpHmff9XLoS7cgJLdaUp5gbmhl&id=61588342686925"}
```

Supported: `ownerId_postId`, Facebook URL containing that pair, `permalink.php`/`story.php`, `/<owner>/posts/<id-or-pfbid>`, `/groups/<group>/posts/<id>`, and a numeric/pfbid post URL. A profile URL or `/share/...` short link is not accepted. Facebook HTTP/mobile URLs are canonicalized to HTTPS on `www.facebook.com`; tracking and comment parameters are removed.

## Result

```json
{
  "ok": true,
  "status": "resolved",
  "isShare": true,
  "reason": "ATTACHED_OR_REPOSTED_STORY",
  "post": {
    "id": "61588342686925_122131613781278089",
    "postId": "122131613781278089",
    "ownerId": "61588342686925"
  },
  "originalPost": {
    "id": "1000419343151470_122138942931244237",
    "postId": "122138942931244237",
    "ownerId": "1000419343151470",
    "pageId": "1000419343151470",
    "profileId": "61587327123544",
    "author": "Shopee"
  }
}
```

The actual result also includes public URLs, author names when available, evidence field/query, requested URL, HTTP status and checkedAt.

- `isShare: true`: the verified primary post has a distinct `attached_story`/`work_reposted_story`, or an explicit repost flag.
- `isShare: false`: the verified primary post explicitly returns `attached_story: null`, without another share reference/repost flag.
- `isShare: null`, `ok: false`, `status: unknown`: unavailable, login/security gate, rate limit, network error, changed/incomplete schema or identity mismatch. **Never treat unknown as false.** A share whose original is hidden may remain unknown.

Share count, Share buttons, external website attachments, text mentioning "share", comments and recommended posts do not establish that a post is a reshare. The detector only examines a SinglePost primary Relay payload matched to the requested numeric ID/pfbid. Page sources use the verified `delegate_page.id` for canonical `ownerId` and `id`; `profileId` retains the additional profile identifier. A missing mapping triggers a second anonymous fetch of the original post within the same 20s deadline. If still unverified, `originalPost.id` is null and `profilePostId` is explicitly kept as a noncanonical alternative. A Page ID is never inferred from an unrelated profile.

Observed 2026-10-22: the supplied public sample opens in Chrome Incognito. Its anonymous document GET returns `adp_CometSinglePostDialogContentQueryRelayPreloader_*` with `data.node_v2.post_id=122131613781278089`, an attached story, and original post ID `122138942931244237`. A minimal public-identity fixture is saved in `test/fixtures/facebook-share/public-share.json`; no request credentials or raw page HTML are stored.

Upstream 401/403/429 stop the check; no login, CAPTCHA bypass or automatic retry. Request body limit 8KB, upstream limit 8MB, 20s total deadline, at most 3 Facebook-only redirects and 4 active checks per process. No user cookies or authorization are forwarded. Anonymous response cookies are isolated to one HTTP invocation and discarded afterward. Invalid input returns 400, oversized body 413, busy 503; upstream uncertainty returns 200 with the explicit unknown result.

The standalone listener binds locally by default. Put authentication/rate limits on your existing reverse proxy before exposing it to external callers. No production process is restarted by this change.

## Test

```sh
npm run test:facebook-share
```

Tests use a sanitized real sample plus negative/missing-field, identity, non-primary payload, upstream gate, SSRF and HTTP contract cases. Live verification must separately exercise the supplied URL, the numeric compound ID, and the original Shopee URL; static fixtures alone do not establish current upstream availability.

### Error audit (2026-10-23)

`npm run test:apis` includes malformed/oversized input, runtime failures, upstream access errors and ES5 error envelopes. Invalid `format` values and ES5 on `/share` are rejected before network access. ES5 failure responses preserve `status`, `reason` and retry information instead of hiding an access failure inside an empty document list. Rate limits include `Retry-After`; internal exceptions return sanitized HTTP 500 JSON. All six endpoints now use anonymous HTTP through a leased proxy; none opens Chrome at request time. Incognito browser use is development-only request analysis.
