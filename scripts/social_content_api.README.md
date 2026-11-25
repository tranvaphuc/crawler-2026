# Social source posts, post comments and keyword search

Run `npm run api:social` (or existing `npm run api:social-metrics`). All endpoints share the local server at `http://127.0.0.1:3805`. This is the standalone social service; it does not start the Redis queues, old Facebook crawlers or production database writers.

Every upstream read uses anonymous HTTP through a mandatory leased proxy; pages already buffered are delivered with zero upstream requests. It never launches Chrome, Puppeteer, a tab, or page JavaScript. Incognito Chrome is a development-only tool to inspect native requests. Anonymous cookies exist only in RAM for one leased session and can be reused within its cursor chain. Native anonymous pagination context can remain in the RAM cursor store until expiry. No user login/session is imported.

### Request admission and health (2026-11-05)

The authenticated public API admits requests before ES lookup, source resolution, or other preparation. Metrics, source, comments, search, post-info, comment-info, and resolve each have independent admission (two running, at most eight waiting; Facebook share/details share four running). A queued request waits at most ten seconds. A full/expired queue returns HTTP 503, `status:"busy"`, `reason:"REQUEST_CAPACITY"`, `Retry-After: 3`; it has not started preparation or an upstream read.

Each admitted request has a 90-second total budget including queueing and preparation, below the reverse proxy's 120-second deadline. Expiry returns HTTP 504, `status:"error"`, `reason:"REQUEST_TIMEOUT"`; disconnect/expiry closes active upstream sockets and releases the admission slot. Proxy lease cleanup is bounded and late acquisition is released. A caller must still check business `status` on HTTP 200: anonymous access, identity, upstream rate limits, missing public fields and incomplete coverage remain explicit outcomes.

`GET /api/health` is process liveness. Protected `GET /api/ready` checks manager health and a usable reserved API key; it does not promise that a social platform will expose every item/counter. Protected `GET /api/runtime/status` reports per-operation active/queued counts, oldest request age, completions, deadlines, disconnects, and capacity rejections. Request completion logs contain route names and timings, never caller URLs, bodies, auth headers, or proxy credentials. The API's four reserved keys are separate from the background crawler ring.

Run `npm run test:apis` for HTTP contracts and admission/cancellation regressions, plus `node --test test/http-session-deadline.test.mjs test/manager-rpc-diagnostics.test.mjs` for managed-session deadline checks.
`npm run api:verify-stability` performs bounded, authenticated reads against the configured public API and writes only status/timing/count/identity summaries under `outputs/api-stability-fix-2026-11-05/`; non-success and unverified cases remain visible in the report.

ES reference lookup refreshes the discovered weekly master-index list every minute and clears failed discovery promises, so a temporary ES failure or a new weekly index does not require an API restart. Default discovery selects the twelve newest valid weekly indices through the current ISO week plus one week of rollover headroom; corrupt far-future names cannot displace current data. An explicit `index` still permits an exact historical/future-index lookup. Exact typed/indexed IDs use GET before bounded search. Facebook comment pagination remains bound to the requested post/comment IDs when Facebook returns an opaque feedback alias. Focused comment URLs compare the native comment ID and parent ID separately.

All flows lease proxies from the shared proxy manager; the key list and per-API policy are dynamic. See `docs/proxy-manager-vi.txt`. Provider cooldown, Retry-After, HTTP 401/403/429 and security challenges stop the read. No direct networking fallback, login or CAPTCHA bypass.

### Ngày đăng feed và reply YouTube (25/10/2026)

Khi feed Instagram/YouTube thiếu ngày, API đọc trang chi tiết của đúng post bằng cùng phiên proxy. `createdAt` là ISO UTC; `dateEvidence:"matched_post_detail"` ghi nhận nguồn ngày và `datePrecision:"second"` chỉ được gán khi có timestamp đầy đủ. Không đoán ngày từ nhãn tương đối như “2 days ago”, không gán nửa đêm cho ngày không có giờ. Nếu nền tảng không trả ngày chính xác thì giữ null.

API chỉ bổ sung ngày cho trang sắp trả, tối đa theo `count` còn lại, và không gọi lại những post đã xác minh trong cùng cursor. Bước này có thêm request cho mỗi post thiếu ngày. Khi hết ngân sách, `phase:"collecting"` / `DATE_HYDRATION_IN_PROGRESS` yêu cầu gọi tiếp `pagination.nextCursor`; đây không phải feed rỗng. Lỗi auth/security/rate limit của trang chi tiết được trả rõ ràng. `since` vẫn loại các post thiếu ngày thay vì đoán.

YouTube reply hỗ trợ cả continuation endpoint và lệnh “Show more” trong button, bao gồm nhánh lồng nhau. `coverage.missingAtLeast` và số reply từng comment cha giúp phát hiện chênh lệch; đọc hết continuation công khai không chứng minh Facebook/YouTube đã hiển thị mọi nội dung ẩn. Sửa phân trang reply không tự xác minh thứ tự cũ nhất nếu timestamp hoặc xác nhận native sort vẫn thiếu.

## Source → posts

`POST /api/social/source/posts`

```json
{"url":"https://www.threads.com/@hapas.vn","limit":20,"order":"latest"}
```

Also accepts Instagram profile URLs and YouTube channel URLs (`/@handle`, `/channel/UC…`, `/c/…`, `/user/…`, optionally `/videos`). One or both `link`/`url` may be supplied; both must identify the same source. Optional `platform` must match. `limit` is 1–100, default 20. Returned posts contain native ID, shortcode where applicable, URL, public text/caption, author, available time, media and available counters. The source object contains the channel/profile identity when exposed.

YouTube source currently reads the **Videos tab**. Shorts, live streams and community posts are not combined into that feed. Threads source includes posts proven to belong to the requested author; unrelated recommendations and quoted/carousel posts are excluded. Order defaults to `latest` (explicit `platform_default` is also accepted). YouTube validates native Latest selection. Threads locally sorts exact dates within the available window, which does not prove newest across the entire source. If exact timestamps remain unavailable after detail hydration, `ordering.verified` remains false and `LATEST_SOURCE_ORDER_UNVERIFIED` is returned. A source feed may expose only a short public window anonymously (e.g. Instagram 12 posts); this is explicitly partial.

## Post → comments/replies

`POST /api/social/post/comments`

```json
{"url":"https://www.youtube.com/watch?v=wlQndvtII1M","limit":50,"includeReplies":true,"order":"oldest"}
```

Accepts Threads post, Instagram post/reel and YouTube video/Shorts URLs, with the same link/url echo and platform validation as metrics. `limit` is 1–100 (default 50), counting comments and replies together. `includeReplies` defaults true. Items distinguish `type:"comment"` from `type:"reply"`; replies have `parentId`. Response also reports `rootComments` and `replies` separately. Native Threads reply chains are read from the bound post's direct/self reply connections, never its ancestors or related posts. YouTube uses native anonymous bootstrap plus /youtubei/v1/next continuation requests. IDs and reply relationships come from native entity payloads. It does not click expansion buttons or execute DOM code.

`order` defaults to `oldest` (explicit `platform_default` is accepted). YouTube collects accessible root/reply continuations before delivering oldest pages: `phase:"collecting"`, `count:0`, `stagedCount` and `nextCursor` mean continue collecting, not zero comments. It requests the native Newest lane and reverses the exhausted root sequence as a best effort. Without a selected-sort acknowledgement or exact timestamps, `rootOrderVerified` remains false. Replies with no exact timestamps also remain unverified. Threads/Instagram sort exact dates only within the public window; Threads can still return native TOP mode. Full/unfiltered coverage is not proven by a local sort. Comment ranking/filtering, deleted/hidden replies and anonymous access limits can leave gaps. No comments returned after a failed read does **not** mean there are no comments. `createdAt` stays null if only relative date text is exposed; `publishedText` preserves it. Missing counters stay null. Public feed titles/text can be shortened by the platform; no detail enrichment is claimed for every source item.

## Keyword → requested post/video count

`POST /api/social/search`

```json
{"platform":"threads","keyword":"HAPAS"}
```

```json
{"platform":"youtube","keywords":["HAPAS","VTV24"]}
```

Only Threads and YouTube. Search accepts count=1..20000 (or all within the 20000-item budget) per keyword. limit controls each page (maximum 100); omitted limit uses count up to 100, or 20 when neither is supplied. Continue nextCursor until count is reached or upstream stops returning new results. YouTube uploadDate accepts any/today/week/month/year and requires a native selected-filter acknowledgement. See outputs/search-facebook-parity-2026-10-25/huong-dan-search.txt for Vietnamese examples. Batch input accepts 1–10 keywords, trims/deduplicates them and processes sequentially. Results stay separate by keyword. On auth/security/rate/proxy failure, the rest are returned in `unstartedKeywords` rather than silently skipped. Use a single `keyword` request for cursor continuation.

**Latest order is required by default when no YouTube uploadDate is supplied. With an explicit YouTube uploadDate and no order, relevance matches the native filter UI.** The reader validates server-side recent variables or a selected upload-date sort. A URL parameter or a “Recently uploaded” suggestion chip alone is not proof of chronological order. During the 2026-10-23 live checks, Threads returned `recent:0` despite recent URL parameters, and YouTube did not confirm an upload-date sort and returned dates out of order. Thus default requests correctly return `status:"sort_unavailable", reason:"LATEST_SORT_UNVERIFIED"`, with no substitute relevance items. The requested guarantee of the 20 newest results is currently unavailable in these anonymous responses.

An explicit alternative is supported, **only when the caller chooses it**:

```json
{"platform":"threads","keyword":"HAPAS","order":"relevance"}
```

This returns the requested number of platform-ranked results up to the accessible upstream window; it does not claim newest order. `ordering.requested` and evidence identify that choice. No automatic fallback is performed.

## Response/pagination

```json
{
  "link":null,
  "url":"original supplied URL",
  "resolvedUrl":"normalized navigation URL",
  "platform":"threads",
  "operation":"comments",
  "status":"partial",
  "reason":null,
  "identityVerified":true,
  "source":null,
  "items":[],
  "count":0,
  "rootComments":0,
  "replies":0,
  "ordering":{"requested":"oldest","verified":false,"evidence":null},
  "pagination":{"nextCursor":null,"hasMore":null,"complete":false,"reason":null},
  "transport":{"mode":"http","browserUsed":false,"anonymous":true,"proxyUsed":true,"requests":2},
  "checkedAt":"UTC ISO timestamp"
}
```

The example is a shape, not a real successful empty result. HTTP 400 indicates invalid input/cursor; 413 oversized JSON; 503 route overload. Checked platform failures carry explicit status (`auth_required`, `security_checkpoint`, `rate_limited`, `proxy_error`, `unavailable`, `sort_unavailable`, `error`) and no fabricated data. In particular, HTTP 200 does not necessarily mean success. `retryAfterMs` and the Retry-After header are returned when available. Preserve existing stored records on read failures.

Send `pagination.nextCursor` with the **same URL/keyword/platform/order/includeReplies/limit**. Opaque cursors are server-local, expire after 30 minutes and disappear on restart. The RAM store retains normalized rows, dedup IDs and native anonymous continuation context; it never persists cookies or credentials. YouTube resumes at the saved native cursor without replaying old pages; Threads/Instagram deliver unused bootstrap rows from RAM. Cached pages report `cacheHit:true, sourceProxyUsed:true, proxyUsed:false, requests:0`. Repeating the same cursor is idempotent and concurrent duplicate calls coalesce. Start FIRST again after a limit change or expired cursor.

Each invocation has a 60-second total budget and at most eight YouTube continuation calls. A collection stops at 20,000 items; the cursor store has a 64 MB estimated state budget and 1,000 entries. Exhausted budgets do not prove completeness. If a continuation fails after collecting records, a `retryCursor` preserves that failed position; retry explicitly only after resolving/waiting for the reported error. Error records may overlap previously staged data: upsert by native ID and do not treat them as a successful sorted page. Threads/Instagram additional native pagination is not yet verified; `NATIVE_PAGINATION_UNAVAILABLE` is returned once buffered rows are exhausted, with no fake cursor.

Inspect `ordering.verified`, `ordering.scope`, `coverage.unfilteredVerified`, `coverage.publicPaginationComplete`, `coverage.complete`, `expectedPublicCount`, `observedUnique`, `countMismatch` and `missingAtLeast`. Public pagination exhaustion is separate from full-comment proof. Platform counts and reply counts can change or include inaccessible records.

`hasMore:true` can mean more candidates are observed or the requested limit was reached; `false` is the observed native connection state; null means unknown. `complete:false` means all posts/comments/replies have **not** been proven exhaustive. An exhausted request budget never implies completion. No zero count or missing record is treated as a dead source.

## Tests and saved outputs

- `npm run test:social-content`: content parser, identity isolation, reply relationships, cursor binding, failure handling, HTTP batch contract plus existing metrics regressions.
- Live output: `outputs/social-content-api-2026-10-23/*-live.json`. Only normalized public content/status is saved; no raw HTML, HAR, cookies, auth headers or proxy credentials.
- `src/services/socialContent.js`: input and scoped extraction.
- `src/services/socialHttpReaders.js`: anonymous HTTP reads, native YouTube continuations and scoped parsing.
- `src/routes/socialContent.js`: endpoints, batch search and opaque stateful cursors.


## Verification

Current ordering audit: outputs/social-ordering-audit-2026-10-23/final-report.json. Previous HTTP migration results: outputs/http-api-transport-2026-10-23/http-live-report.json. Older outputs/social-content-api-2026-10-23 files describe the previous browser implementation and are historical evidence only. Run npm run test:apis for parser, HTTP/proxy, cursor, identity and runtime-no-browser regressions. Source/comment counts are partial public samples, never a guarantee that every URL or reply is accessible.

### Error audit (2026-10-23)

`npm run test:apis` checks all six endpoints. HTTP failures and API auth/rate errors take precedence over cached content; 5xx is `error/UPSTREAM_HTTP_ERROR`, never an empty completed list. A pagination auth/security/rate failure retains already collected items with that failure status and `pagination.complete:false`; clients must inspect status before treating a page as successful. Failed pages do not receive a success nextCursor; a retryCursor can retain the failed native position and staged data. Generic API errors can return verified partial items with `UPSTREAM_API_PARTIAL_ERROR` and sanitized warnings; no items means an explicit error.

Batch search preserves earlier keyword results when a later read throws, emits that keyword as `error/INTERNAL_ERROR`, and stops before remaining `unstartedKeywords`. `successfulKeywords` counts `ok/partial` results and `failedKeywords` counts other attempted outcomes. Batch `checked` means all keywords were attempted, not all succeeded. `busy`, `error`, access, security, rate and proxy failures stop the batch. Invalid `keywords` types are rejected before proxy acquisition. Input/body failures use HTTP 400/413/415; unexpected router failures use 500. Business extraction failures remain HTTP 200 with explicit per-result statuses. No error is treated as zero comments or source death.

### Định danh bài Facebook (cập nhật 25/10/2026)

Bài từ `/api/social/source/posts` trả `id` và `systemId` dạng chuỗi `sourceId_postId`; `url` là `https://www.facebook.com/sourceId_postId`. `sourceId` và `postId` được trả riêng. `originalUrl` giữ liên kết trước chuẩn hóa; `mediaId`/`mediaType` giữ ID và loại media khi có. Với group, `sourceId` là group đang lấy bài; với Page là Page ID đã xác minh, không phải timeline Profile ID.

`/api/social/post/info` và `/api/facebook/post/details` nhận thêm `/reel/<id>`, `/watch/?v=<id>`, `/<owner>/videos/[slug/]<id>` và `/photo/?fbid=<id>` (cả `photo.php`). Resolver nối media chính xác tới `creation_story`/`story`/`container_story`, rồi đọc ID bài thật. Không dùng ID media làm ID bài. Profile cá nhân có `is_additional_profile_plus=false` giữ User ID, kể cả khi có `delegate_page`. Nếu không có bằng chứng bài tương ứng, trả `MEDIA_POST_ID_UNVERIFIED` với `post=null`; không tự đoán từ URL.

Với link `/<owner>/videos/.../<mediaId>`, HTTP reader dùng `watch/?v=<mediaId>` để đọc cùng media; không lấy phần username hoặc số trong URL làm source/post ID. Link đầu vào vẫn được giữ riêng. ID dài luôn giữ dạng chuỗi.

### TikTok interaction qua upstream API

`POST /api/social/post/metrics` nhận `{ "platform": "tiktok", "url": "https://www.tiktok.com/@username/photo/ID" }` hoặc link `/video/ID`. Có thể gửi cả `link` và `url` nếu cùng ID. Chỉ hỗ trợ interaction; chưa mở rộng source/comment/post-info TikTok. Client vẫn gửi Bearer `AUTHEN_KEY_FOR_DOMAIN`; key upstream `TIKTOK_INTERACTION_API_KEY` chỉ nằm ở server, endpoint trong `TIKTOK_INTERACTION_API_URL`.

Adapter gọi GET upstream với query `url` được encode bằng URLSearchParams, chặn redirect, giới hạn timeout/kích thước response. Trả các metric chung (`likes/reactions/shares/comment/views/saved/reshares/repost/quotes`) khi có số chính xác, giữ `null` khi thiếu. ID upstream phải trùng ID yêu cầu mới nhận counters; không nhận số từ response của bài khác. HTTP 401/403 upstream là lỗi cấu hình/key upstream, khác 401 do xác thực API của mình. Rate limit giữ Retry-After; không tự thử vô hạn.

Upstream trả `die` -> `status: unavailable`, `reason: TIKTOK_UPSTREAM_REPORTED_UNAVAILABLE`, `upstreamStatus: die`; không kết luận chắc bài đã xóa. `transport.mode=upstream_api`, `proxyUsed`/`upstreamProxyUsed=null` vì API này không cung cấp thông tin proxy bên họ; runtime không mở TikTok bằng browser.
