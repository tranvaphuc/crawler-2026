# Anonymous HTTP and proxy social metrics API

Endpoint: `POST http://127.0.0.1:3805/api/social/post/metrics`.

Accepts Facebook posts, Threads posts, Instagram posts/reels (`snsTopic` with an Instagram URL routes by URL), and YouTube videos/shorts/live URLs. No database read/write or old crawler restart is involved.

## Start and proxy configuration

```sh
# Preferred: explicit server-side proxy list, file permissions 0600.
SOCIAL_METRICS_PROXY_FILE=/absolute/path/proxies.json npm run api:social-metrics

# Alternatively a rotating provider key stored in a local private file:
SOCIAL_METRICS_PROXY_KEY_FILE=/absolute/path/key.txt npm run api:social-metrics
```

Proxy list format (examples only, replace with your real configuration):

```json
[
  "http://username:password@proxy-host:port",
  {"protocol":"http","host":"another-host","port":12345,"username":"user","password":"password"}
]
```

Supported HTTP/HTTPS proxies. Runtime uses Node HTTPS with HttpsProxyAgent; it does not import Puppeteer, launch Chrome, open tabs or execute page JavaScript. Proxy credentials are used only for the tunnel and never added to origin authentication headers. Each invocation gets an anonymous in-memory cookie jar, discarded on completion. No user browser/session is accessed.

The default private named-pool configuration is outputs/social-proxy-pools-2026-10-23/runtime.credentials.json. Override with SOCIAL_METRICS_PROXY_POOLS_FILE, or an explicit SOCIAL_METRICS_PROXY_FILE / SOCIAL_METRICS_PROXY / SOCIAL_METRICS_PROXY_KEY_FILE. No old crawler-key fallback is used. Keys and proxy credentials stay on the server. Proxy provisioning contacts the provider; every platform data request uses the leased proxy. Failed provisioning never falls back to direct Internet access.

SOCIAL_METRICS_HOST and SOCIAL_METRICS_PORT configure the listener (default 127.0.0.1:3805). Chrome/headless environment settings do not affect runtime. Incognito/proxy browser scripts are development-only discovery tools. Metrics use a bounded anonymous document request and native public JSON extraction; no claim of private owner analytics. Request, decompression, response size and redirects are bounded. Auth, checkpoint and rate limits stop the check.

## Input

```sh
curl http://127.0.0.1:3805/api/social/post/metrics \
  -H 'Content-Type: application/json' \
  -d '{"link":"https://www.facebook.com/1000419343151470_122138942931244237","url":"https://www.facebook.com/1000419343151470_122138942931244237"}'
```

One or both `link` and `url` may be supplied. Both must identify the same post/video; their original strings are echoed without replacing them with normalized URLs. `resolvedUrl` is the normalized navigation URL. Optional `platform` must match the URL. Optional `type:"snsTopic"` does not override platform routing: `instagram.com/p/...` goes to Instagram. A source/profile/channel URL is not a post URL. Short redirect links such as `/share/...` are not currently accepted. Invalid input returns HTTP 400; oversized body 413; concurrency overload 503 plus Retry-After.

## Output contract

Shape below illustrates the schema, **not a real successful live result**:

```json
{
  "link":"the original link field, or null",
  "url":"the original url field, or null",
  "resolvedUrl":"normalized navigation URL",
  "platform":"facebook|threads|instagram|youtube",
  "status":"partial",
  "reason":null,
  "metrics":{
    "reactions":null,"shares":null,"comment":null,"views":null,
    "saved":null,"reshares":null,"repost":null,"likes":null,"quotes":null
  },
  "metricStatus":{},
  "extraMetrics":{},
  "evidence":{},
  "identityVerified":true,
  "transport":{"mode":"http","browserUsed":false,"anonymous":true,"proxyUsed":true},
  "checkedAt":"UTC ISO timestamp"
}
```

- Values are exact nonnegative numbers or null. An explicit zero is retained; missing or hidden values do not become zero. Approximate `1.2K`/`4M` labels are not expanded into fake exact counts.
- Each `metricStatus` entry is `available` with its source field, `not_returned`, `not_public`, or `conflicting`. If the same matched entity returns conflicting exact counts in the captured snapshot, that metric is null.
- `extraMetrics` includes available native `*_count` fields of the matched post and Facebook reaction breakdown. This does not enumerate unrelated recommended posts, comments, user profiles, or tracking data.
- `quotes`, `reshares`, `repost` remain separate; no quote count is silently substituted for reshares. `shares` is also separate. A Boolean “this post is a repost” does not become a repost count.
- Facebook reactions is the primary post's total reactions; likes is the Like reaction. Threads/Instagram public reaction count is represented by likes. YouTube reactions aliases public likes; it does not claim to include a hidden dislike total.
- Saved/bookmark totals, shares and other analytics may be private or simply absent. The reader does not log in to owner analytics; null is expected for such metrics. A publicly returned explicit count can still be reported with evidence.
- YouTube comments/likes are reported only when exact counts are exposed in the matched video response/UI data. Disabled/hidden comments do not automatically become zero.
- Video play/view metrics are tied to the attached media where that is the actual field; evidence names the scope. They should not be interpreted as unique viewers.

Statuses: `ok` (all schema metrics present), `partial` (some exact public metrics), `unavailable` (no usable exact counters), `auth_required`, `security_checkpoint`, `rate_limited`, `proxy_error`, `error`. `busy` is returned with HTTP 503. These describe the check, not whether a source is permanently dead.

For runtime/auth/proxy uncertainty, the endpoint returns HTTP 200 with explicit status/reason and null counters so the caller can retain previous measurements instead of overwriting them with zeros. It never exports cookies, proxy passwords, tokens, raw HTML or HAR. Network/TLS/auth errors are sanitized. Retry-After/cooldown is returned when available.

## Code and verification

- `src/services/socialMetrics.js`: input normalization, identity-bound parsers and evidence.
- `src/services/socialHttpReaders.js`: mandatory proxy, temporary browser, incognito context and cleanup.
- `src/routes/socialMetrics.js`: HTTP contract/concurrency limit.
- `scripts/social_metrics_api.mjs`: standalone local service, independent of Redis/ES.
- `npm run test:social-metrics`: parser/contract tests, including synthetic Threads/Instagram/YouTube payloads and a real saved Facebook fixture. Passing fixture tests does not establish live platform availability.
- `node scripts/probe_social_metrics_transport.mjs`: real Chrome with a local proxy that refuses all tunnels; verifies incognito/CONNECT/proxy auth without fetching any platform data. Results are explicitly transport tests, not successful metrics reads.
- Successful live platform tests require a working external proxy. Current results under `outputs/http-api-transport-2026-10-23/` must be interpreted by their status, not assumed to contain counters.

Live validation with the newly assigned pools succeeded on 2026-10-23 through visible Chrome incognito and external proxy for all four platforms. Each response recorded `incognito:true, proxyUsed:true`:

| Platform | Reactions/likes | Comments | Other returned counters | Duration |
|---|---:|---:|---|---:|
| Facebook | 544 total / 305 Like | 506 | Shares 494; reaction breakdown | 11s |
| Threads | 12 | 3 | Reshares 2, repost 2, quotes 0; native counters | 11s |
| Instagram | 1707 | 14 | Other requested totals absent | 9s |
| YouTube | 270 | 222 | Views 8640 | 10s |

These are timestamped sample results, not guarantees for every URL or future counter values. All responses are `partial` because some requested totals are unavailable anonymously. Safe live results are stored as `{platform}-live.json` under the output directory. The old key failure was superseded by this successful validation; no direct platform fallback was used.


## Assigned proxy pools (2026-10-23)

The standalone runner now defaults to `outputs/social-proxy-pools-2026-10-23/runtime.credentials.json` when no explicit static/list/key override is supplied. Override with `SOCIAL_METRICS_PROXY_POOLS_FILE`. Configuration and key files are private (0600), in a private directory (0700), excluded from Git and exports.

| Pool | Keys | Metrics route |
|---|---:|---|
| facebook_page_posts | 15 | Reserved for page source posts |
| facebook_group_posts | 20 | Reserved for group source posts |
| facebook_user_posts | 5 | Reserved for user source posts |
| facebook_auto_comments | 45 | Reserved for automatic comments |
| facebook_api_comments | 5 | Reserved for manual comment API |
| threads_metrics | 3 | Threads |
| youtube_metrics | 1 | YouTube |
| instagram_metrics | 1 | Instagram |
| facebook_post_detail | 5 | Facebook metrics/detail |

100 unique keys, no allocation overlap. The new metrics endpoint selects its assigned pool by platform. Other pools are configured and reserved, not a claim that existing crawlers have been migrated or started. `createNamedProxyPoolProvider` also accepts an internal `{pool: name}` target for future worker integration; callers cannot choose a pool through the public metrics request.

Keys round robin within each pool and stay reserved until the associated browser closes. Cached proxy leases last 120 seconds. A busy/cooling pool returns an explicit error and retry interval; no other pool or direct connection is used as fallback. This allocator is process-local: share the provider in one scheduler rather than instantiate independent allocators for the same keys across processes.


Source posts, comments/replies and keyword search use the same service and proxy pools. See `scripts/social_content_api.README.md` for endpoints, live limitations of latest search, and cursor semantics.

### Error audit (2026-10-23)

Run `npm run test:apis` for the six-endpoint regression suite and failure injection tests. HTTP 401/403/429/404/410/5xx and login/checkpoint redirects take precedence over embedded stale counters. Upstream HTTP 5xx is `error/UPSTREAM_HTTP_ERROR`; TLS failure is `error/TLS_VALIDATION_FAILED`, not a platform checkpoint. Native API auth/rate errors inside HTTP 200 are also surfaced. Generic GraphQL errors with independently verified counters produce `partial/UPSTREAM_API_PARTIAL_ERROR` and a sanitized `warnings` array; with no usable counters they produce `error/UPSTREAM_API_ERROR`.

HTTP 200 is a check result, not proof of successful extraction: inspect `status`, `reason`, and each nullable metric. Router admission overload returns HTTP 503. `Retry-After` is forwarded for finite positive retry durations. Input syntax errors are 400, oversized bodies 413, unsupported JSON encoding 415, and unexpected router failures 500. No raw exception messages or credentials are returned. Proxy acquisition and HTTP reads are bounded; late leases are released. Cleanup exceptions cannot overwrite the result.
