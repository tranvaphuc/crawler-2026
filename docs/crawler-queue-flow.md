# Continuous queue flow

## Local UID account usage logging, 2026-11-01

The local worker and its header-validation/health-probe scripts append whitelisted events to `outputs/local-uid-worker-2026-10-29/uid-account-usage.events.jsonl`. `node scripts/report_local_uid_accounts.mjs` rebuilds per-account and per-header-session counters; the worker refreshes `uid-account-usage.summary.json` every 15 seconds. The journal is authoritative across restarts and multiple probe processes. Historical requests before instrumentation are not backfilled as exact account counts, and normal browser traffic is outside its coverage.

Account identity is an HMAC of the authenticated cookie's account identifier, using a private local salt; raw cookies, tokens and account identifiers are never journaled. Each curl request uses its own private immutable config snapshot, so refreshing/changing an account while requests are in flight cannot misattribute the old responses. All event/summary/salt/config files are mode 0600; temporary request directories are 0700 and deleted when curl closes.

`requestAttempts` counts curl invocations; `httpRequestsConfirmed` includes completed HTTP hops/redirects. Transfers that may have sent a request without receiving a final response, or lose their curl accounting, increase `httpRequestsUncertain` instead of fabricating an exact count; that uncertainty count is not an exact upper bound on unknown redirect hops. `nativeUidProofs` counts proven responses and `uniqueNativeUids` deduplicates hashed UIDs across sessions. `resolvedJobs`, `cacheJobs` and `sharedRequestJobs` are separate and never increase request/proof counters. Header validation and health probes have their own purpose counters.

`firstLimitObserved` records the first observed HTTP 429 or explicit native feature-block response; `firstFeatureBlockObserved` requires the native error route's temporary-block/going-too-fast message. Generic profile errors, missing UID, login/checkpoint and unavailable content do not establish account limiting. The first observation freezes request ordinal/start time, observation time, confirmed/uncertain request counts, proven/unique UID counts, in-flight count, last UID success, concurrency and request rates over 60/300 seconds. The limit journal preserves later observations as well. These are measured observations, not a guaranteed Facebook quota or the exact instant of an unseen server-side policy change.

## Facebook process isolation, operator-confirmed 2026-11-01

Opt-in topology version 3 gives Facebook page, group and user source queues their own processes, and separates root comments from replies. Roles are `facebook-page-sources`, `facebook-group-sources`, `facebook-user-sources`, `facebook-comments`, `facebook-replies`, `social`, `social-comments`, and `imports`, plus the existing coordinator. Version 2 remains supported for rollback. The obsolete `facebook-sources` role is rejected under version 3 to prevent overlapping owners.

Each queue has exactly one owning role, a distinct process lock and pulse file. Moving a queue does not change its Bull name, job IDs, concurrency budget, native checkpoint or retry history. The local UID worker and proxy keys are unchanged. Performance monitoring derives queue ownership and source pressure from the selected topology; a busy group-source process does not attribute its event-loop utilization to page/user sources. Live source settings continue to supply the original per-queue budgets.

Before/after samples and deployment backups are kept in `/var/lib/crawler-v8/facebook-process-isolation-20261101`. During measurement, source tuning is held at the captured concurrency with a bounded expiry; no failed jobs are retried. Metrics distinguish successful ES writes from completed jobs that may have ended without public data. Tests cover both layouts with separate OS processes, Redis exclusive locks, checkpoint-preserving source yields and an untouched external UID queue.

Deployment verified five active Facebook processes with one worker client per queue and no legacy source owner. Source budgets remained page 19/group 15/user 6; comment/reply remained 150/70, with 50 provider keys. Adjacent 120-second samples recorded 7,324 versus 8,924 acknowledged ES writes (3,656 versus 4,453/minute), with host CPU 67.0% versus 83.9%. This is a short mixed-workload observation, not a sustained throughput guarantee. Source event-loop utilization fell from 97% in the shared role to 80%/64%/36%; comment/reply loops remained saturated, and `PROXY_ENDPOINTS_UNAVAILABLE` failures rose from 5 to 27. Three newly confirmed Facebook post documents were found directly in ES. Source tuning was restored after sampling; the monitor recognizes all new roles and the coordinator's systemd dependencies persist the layout across reboot.

## Facebook rate-limit policy, operator-confirmed 2026-11-01

`FACEBOOK_RATE_LIMITED` and Facebook HTTP 429 now rotate the current read's proxy under the existing 100-retry budget. The failed endpoint is excluded in that job's durable retry context; the next attempt bootstraps a new session while preserving the exact native cursor and buffered items. Exclusions do not propagate to another source/comment/reply job or another API scope. This is the operator's retry policy, not proof that every proxy or every Facebook API is limited.

Facebook no longer publishes, restores, reads or registers intake gates for `facebook:origin`. Historical shared cooldowns are backed up and superseded; only delayed jobs carrying a future Facebook origin-wait deadline are released. Failed jobs are retained. Other platforms keep their existing policies, and native security challenges keep their existing terminal behavior. The deployed policy is `independent-rounds-operator-error-policy-v12-facebook-proxy-rotation`.

## UID session health reconciliation, 2026-11-01

The local UID header refresh must also reconcile the public origin-health marker on the server. A historical Phúc 2 block remained `waiting_for_origin_recovery` after the operator changed to a working Phúc 1 session. An independent performance intervention used that stale marker to globally pause `find-uid` again at 10:50:27 UTC on 1 November. The performance timer itself only reads this marker; it does not call `queue.pause()`.

After successful session validation, run `node scripts/reconcile_local_uid_health.mjs --apply`. This performs one bounded native UID probe using the local private curl configuration, sends only public proof metadata over SSH, backs up the prior marker, atomically marks the current session recovered, and resolves the old performance incidents. It does not send Facebook headers/cookies/tokens, retry failed jobs, alter concurrency, or resume a queue by default. `--resume` is reserved for an explicitly authorized operator recovery. A failed probe or a newer block observation leaves the marker unchanged. The header-refresh automation runs reconciliation after successful validation.

Pause/resume Redis events are now retained in `flow_queue_mutation_events`, including changes made outside Bull Board. HTTP actions still retain their separate actor audit. Historical block evidence remains in the marker backup and history; it is not evidence that a newer authorized session is blocked.

`crawler-queue-flow.service` replaces both v8 worker shards and the v8 watchdog. Source documents stay in `sources`. ES5 remains the master. Eleven independent BullMQ queues use the requested fixed concurrency; `crawler-flow-es5-import` has 20 additional workers.

| Queue suffix | Workers |
|---|---:|
| facebook-page-source | 30 |
| facebook-group-source | 60 |
| facebook-user-source | 10 |
| instagram-source | 5 |
| youtube-source | 5 |
| threads-source | 5 |
| facebook-comment | 150 |
| facebook-reply | 70 |
| instagram-comment | 5 |
| youtube-comment | 30 |
| threads-comment | 5 |
| es5-import | 20 |

The coordinator queries Mongo continuously, orders candidates by their last dispatch time, and enqueues every eligible source independently of worker concurrency. Existing source tickets prevent overlapping jobs; worker counts limit execution only. Comment producers retain a bounded waiting buffer. The coordinator refills queues immediately without a per-source or per-post cooling interval. The coordinator polls every 100 ms to avoid a busy loop. Only detected native channel/type combinations enter the queues; Facebook page/user sources additionally need matching stored identity proof. A Redis owner lock prevents a second coordinator from doubling the worker counts.

`flow_jobs` is the durable queue outbox. Bull tickets include source identity, post/buzz parent fields, native cursor, compressed public reader state and the proxy provider/pool context. Proxy credentials, live leases, cookies and CSRF tokens stay in the worker. A new worker acquires a managed lease and bootstraps an anonymous request session around the preserved cursor. A read error always releases that session. Each job allows an initial attempt plus at most 100 retries; exhaustion fails and retains the job. Validation and ES5 import errors fail immediately and remain available on Bull Board. Manual retry uses edited Bull payload data. Failed Mongo evidence is retained even when its Bull ticket disappears.

Source jobs scan a fixed rolling 72-hour window. Instagram feed entries without publication dates are hydrated from their matching public permalinks before a native page is delivered or its cursor is advanced. Hydration keeps its pending items and request budget in the durable checkpoint. The first delivered page cannot trigger the old-post cutoff; subsequent pages can. An explicit exhausted native cursor ends the job; empty pages with a continuation advance. Recent posts go to the ES5 import queue. When a feed omits its comment counter, the source worker reads verified post metrics with the same bounded proxy retry policy before deciding whether to store the post for comment crawling. Unknown counters are never treated as zero. Posts with a positive exact comment count also enter `flow_posts`, with `lastInteractionAt` initialized to their publication date. Source `latestPostAt` only advances.

Comment jobs are supplied from `flow_posts.lastInteractionAt >= now - 48 hours`. Every observed comment or reply can advance this field with Mongo `$max`. Facebook processes one native page per Bull job, persists children before completing the current job, and routes root cursors to `facebook-comment` and positive reply cursors to `facebook-reply`. The reply queue has no Mongo producer. Instagram, Threads and YouTube comment jobs keep paginating their current post. An entity cannot start a fresh root cycle while any of its continuation jobs remains queued, active or failed. The operation used for Threads pagination is verified from its public Bootloader module; its bootstrap direct query is not reused as a next-page query.

Post records older than 72 hours by last interaction are deleted at startup and at least every minute thereafter. ES5 records are retained. Completed Bull tickets and Mongo outbox entries are removed immediately; failed jobs have no retention expiry. The import worker validates native IDs, parent fields, URLs, publication timestamps and the destination ES5 mapping, then writes by deterministic index/type/id.

Bull Board stays behind the existing authenticated HTTPS endpoint and exposes all twelve queues with editing, retries, deletion, pause/resume and other standard Bull Board actions enabled. `/api/summary` reports each queue's configured workers and live counts.

Run checks with:

```sh
node --test test/crawler-queue-flow.test.mjs test/meta-source-pagination.test.mjs test/meta-comment-pagination.test.mjs test/social-http.test.mjs test/facebook-comments.test.mjs
```

Use `npm run crawler:queues:verify` to inspect fixed concurrency, live counts, invalid source samples, retained import errors and cumulative completion counters.

## Deployment verification, 2026-10-27

The former workers and watchdog are stopped; the former primary worker and watchdog timer are disabled. The static second shard has no enablement link and no running primary to start it. `crawler-queue-flow.service` and the existing dashboard service are active.

The reset removed 173,997 old jobs, 513,946 staging documents, 177,830 quarantine records and their operational checkpoints/scheduling records. All 24,115 source records and existing ES5 data were retained. The full backup at `/var/lib/crawler-v8/flow-reset-backup-CMP08f` contains 1,338,938 records across 36 collections; its compressed file was read back and every collection count was checked. SHA-256: `6665c897664ea2013943496fe4fd7f455a1393d1204a6ae100afa782efc2e56e`.

Live verification confirmed the configured queue limits, no invalid source in the sampled tickets, empty legacy jobs, immediate completed-job removal, Facebook comment-to-reply handoff, successful ES5 writes verified with `get`, and all twelve Bull Board adapters reporting `readOnlyMode: false` / `allowRetries: true`. The public HTTPS endpoint requires authentication. Fresh validation failures for missing publication dates or unverified Facebook comment author IDs remain available on the import queue as requested.

Final local regression run: 132 passed, 1 skipped, 0 failed.

## Full source admission and retry limit, 2026-10-27

All eligible sources receive durable source tickets without a worker-based admission cap. Source feeders scan the complete matching inventory and skip entities already queued, running or retained as failed. All active flow readers (source, post metrics, comment, reply and UID lookup) share a limit of 100 proxy retries after the initial attempt. Checkpoints already above 100 retries terminate without another upstream request. Proxy assignment waits without an upstream request remain scheduling waits. Import/validation failures still fail immediately.

Live verification at 18:01 ICT confirmed all 14,410 eligible sources were scheduled and represented in both the Mongo outbox and BullMQ: Facebook pages 2,725, groups 8,423, users 1,771, Instagram 246, YouTube 555, Threads 690. No Bull tickets were missing. Source admission persists and publishes batches of up to 250; worker concurrency does not limit admission. The final service was active with zero restarts. Focused checks passed locally (25 tests) and on the server (23 tests).

## Independent source rounds, user-confirmed 2026-10-27

Updated 2026-10-30: each source queue refills when its waiting buffer is empty, without waiting for active jobs or another queue. Paused/prioritized waiting tickets and queued durable outbox records prevent duplicate admission. Sources with queued/running tickets are excluded from the next round; their current checkpoints and retries continue. Multiple rounds may remain running together, and each round completes its own summary once its members settle. Failed tickets remain visible and do not block the next round; their sources receive new tickets in the new round, while the old failures stay available. Successful tickets are removed immediately. Retry exhaustion is a failure and is retained in every queue. The current retry limit is 100 after the first attempt.

Deployed at 08:57 ICT on 30 October after 43 focused tests passed. The module SHA-256 is `dc3b1d183bd7bbf8bd6b12e1897fa6aed8a9aaa7704b76865c71162631cbd591`; the prior module is backed up at `/var/lib/crawler-v8/crawlerSourceRounds.before-waiting-refill-20261030.js`. Graceful restart completed with service active/running, PID 449350, NRestarts=0. Empty-waiting admission with an active source was verified in regression tests; no live empty-waiting refill event had been observed at the post-restart check.

`flow_source_rounds` stores each round's fixed source membership, loading/running/completed state, start/end time, summary and counter snapshots. `flow_source_round_results` stores idempotent per-source outcomes; `flow_source_round_items` stores deduplicated identities of posts/comments observed for attribution, without retaining successful job payloads. Observation counts mean records submitted by readers, not confirmed ES5 inserts or full comment coverage. Comment observations can arrive after the source round ends. Comment/reply queues continue independently of source round completion.

At upgrade, outstanding source jobs join the first monitored round with their native checkpoint and retries intact. Completed members are not re-admitted on restart during loading. New round ticket IDs include the round ID, so retained failures do not exclude an eligible source from future rounds.

Read-only monitoring: `node scripts/report_crawler_source_rounds.mjs`. To follow a fixed cohort rather than a newer round, use `--round-ids=<comma-separated round IDs>`. This reports round progress, success/failure/retry exhaustion, observed posts/comments, all thirteen queues and retained failure reasons. Tests: `node --test test/crawler-source-rounds.test.mjs test/crawler-queue-flow.test.mjs test/continuous-queue-feeders.test.mjs test/find-uid-queue.test.mjs test/producer-import-refresh.test.mjs`.

User operating preference is ask-before-change across sources/issues, except the explicit overnight authorization described below: autonomous QC/repair until07:00 Vietnam time28 October2026; thereafter read-only monitoring and ask before changes.

## Ten-second attempts, confirmed-proxy-limit retry only, user-confirmed 2026-10-27

All active queue HTTP requests, post metrics and UID lookup use a10,000ms per-request timeout. Multi-request reads are bounded at30,000ms. Acquisition/report/release receive bounded remaining time. Internal pacing can wait at most1,500ms per permit; there are no indefinite proxy/backoff/cooldown loops or hidden lease-expiry retries. ES5 requests and Mongo sockets/pool waits remain bounded at10,000ms.

Only a confirmed proxy-specific limit is retryable, at most ten retries after the initial attempt. Positive evidence is CONNECT HTTP429 observed by the proxy agent with a matching hashed endpoint. Internal manager pacing is not IP-limit evidence. Generic upstream429/Facebook1675004, auth/checkpoint, timeout/network, pool/backoff/cooldown failures retain the request failure without retrying or quarantining a shared proxy as if its IP were proven faulty. The fail-fast crawler reports unconfirmed rate/auth as errors to the manager while preserving the original job status/reason. Existing historical cooldowns are not erased blindly. Failed tickets remain; later independent source-round tickets are separate observations.

The original 23,601-job monitor cohort and its 10-minute schedule are unchanged. No historic stalled ticket is retried, deleted or reconciled by this change. Graceful-shutdown changes and reconciliation of the five previously diagnosed stale records remain pending user approval.


## Overnight QC override, 2026-10-27

The user explicitly authorized autonomous diagnosis, fixes, testing, deployment and recovery until morning, and asked to delete the former fixed-cohort ten-minute automation. That authorization supersedes the earlier ask-before-change preference for this overnight window only. Preserve failed tickets and native identity/date/parent validation; do not invent missing identity facts or bypass authentication/security gates.

Policy v6 distinguishes each network request's 10-second timeout from a bounded 30-second reader attempt (bootstrap plus GraphQL/metadata can require multiple requests). Each permit can wait at most 1.5 seconds in total for short internal pacing; longer waits fail immediately without spending a proxy retry. Acquisition is bounded at ten seconds. Only CONNECT HTTP 429, explicitly observed from the proxy agent with a matching endpoint hash, qualifies for up to ten proxy retries. Internal manager pacing and unscoped upstream 429/1675004 do not prove IP limiting.

Facebook anonymous bootstrap context is reused only within the same live HTTP session. Socket teardown destroys active requests. A network failure from another lease no longer aborts existing healthy leases through manager backoff; new assignments still honor backoff. Same-scope acquisition prefers spreading leases across endpoints.

Empty source pages with a native continuation continue; an explicit native end flag proves exhaustion. Missing Meta page_info flags are errors. Emitted pages are written ahead to the durable pendingPage payload before import/metrics, so manual recovery cannot skip rows after the native cursor advanced. Incomplete terminal non-Facebook comment coverage remains failed after observed data is preserved. Retained failed Mongo evidence is no longer deleted merely because a Redis ticket disappeared.

Opaque Facebook post authors can enter the existing proof-backed UID handoff, like opaque comment authors. Only native response evidence can supply the numeric author ID; resolved posts still pass canonical source binding and normal ES5 validation. This does not authorize substituting the inventory ID for an unknown author.


QC completion notes, overnight 27–28 October: all returned HTTP errors release sticky managed leases. CONNECT sockets are owned by an AbortSignal; timeout closes them before assignment to ClientRequest. TLS tunnels use keep-alive within the same leased session. YouTube HTTP200 API errors preserve the native cursor as failures. Facebook wrappers retain precise UPSTREAM/TLS reasons.

Shutdown explicitly pauses worker intake at signal time. A stopped processor returns its ticket to waiting via BullMQ's rate-limit sentinel without counting a failed attempt. DelayedError is deliberately avoided during shutdown: BullMQ5.70 handles it by fetching a new active ticket even when paused/closing. Live verification with115 active jobs and queues not globally paused drained/restarted in14 seconds; the subsequent deployment drained in13 seconds.

A620-job recovery batch completed with97 confirmed successes and523 retained failures, including298 local pacing failures. This is evidence for tuning, not a claim of completed QC. Effective read concurrency is now FB comment10, FB reply20, YouTube comment10; other queues keep their original concurrency. Nominal maximum worker budgets remain declared, and source admission still loads the full eligible inventory. Runtime/watch report effective concurrency separately. An80-job canary checks this change before further recovery expansion. Generic rate/auth/identity errors remain failures; no job is silently cleared to improve the ratio.

The old ten-minute cohort automation was explicitly deleted. The active quiet overnight QC automation continues tests, diagnosis and recovery until07:00 Vietnam time28 October, then returns to read-only monitoring and asks before further changes. It must preserve actual unresolved issues and distinguish confirmed job outcomes from all-crawler ES records touched within a time window.

Latest data-path QC: earlier successful YouTube pages can provide publication/identity/parent-verified buffered rows for import even if the next request fails; the read ticket remains failed. Source rows with valid publication/identity can still be offered after a comment-counter lookup failure; unknown counters remain null, never zero. Each row passes the same normal serializer guards before partial delivery. Native error code and bootstrap/query stage are retained for diagnosis. The concurrency canary rescued17/50 previously failed FBreply jobs and reduced its pacing failures to1/50; remaining timeout/auth/coverage problems require continued QC, not a blanket success claim.

Request-timeout QC reproduced a settlement race using an owned TLS tunnel: aborting first could surface ECONNRESET before the request's own deadline error. The deadline now settles UPSTREAM_TIMEOUT before destroying sockets. Acquisition is separately clamped to the per-request budget, and Meta source errors preserve explicit Retry-After.

Comment candidate admission scans stable _id pages per queue. A retained failed prefix previously caused the same limited candidate page to be examined repeatedly, starving unrelated eligible posts. Existing tickets still block their own entity, including failures; paging advances past blocked rows without retrying or deleting them. Capacity exhaustion preserves the unvisited tail and enqueue errors do not advance the cursor.

Additional overnight QC: retain lastReadCoverage and safe lastReadPagination separately, because terminal readers can discard continuation state before a coverage failure is recorded. Successful reads clear stale lastReadError. This records evidence without relaxing completeness checks. Proxy manager acquire now reclaims a late lease when the HTTP caller disconnected before delivery; a normal finished response keeps its lease. The owned HTTP test failed before the route change and passes after it. The production route is under /opt/crawler-api/current; manager state/leases are persisted and retained across restart.

Meta source QC distinguishes intentional foreign repost filtering from lack of native progress. A page consisting entirely of parseable foreign-author rows with numeric owner IDs can advance only with a valid next cursor or explicit native end. Excluded public IDs are persisted in reader context, so the same excluded page with changing cursor tokens still fails after checkpoint restart. Missing owners, empty malformed edges, same-owner username conflicts, repeated own posts and repeated cursors remain errors. Synthetic native-response regression proves this branch; the previously probed live Threads pages contained repeated own posts and are not repaired by this change.

CPU QC measured a repeated YouTube native sample before/after a bounded one-document cache of immutable application/json script text extraction. Parsed JSON objects are never cached: each call gets independent mutable objects, and network response bodies are always parsed fresh. This preserves identity, EOF and public coverage semantics. The real staging canary returned3/3 roots complete in both cases; process CPU3185ms to2443ms (~23% lower), wall5214ms to5050ms. These are single-sample measurements, not a claim of23% more crawler throughput or elimination of timeouts. Synthetic20-call DOM-heavy extraction benchmark491.6ms to54.8ms; local101passed1skipped, staging63passed. Production deployment19:04:51Z drained12 seconds.

The single audited pipeline canary qc-v6-payload-cache-canary-20261028 failed UPSTREAM_TIMEOUT on its first request; the original failed ticket remains. ES baseline and after both had3 historical records from13:53Z, unchanged; no new imported data. Recovery expansion stopped. Isolated successful3/3 native probes do not establish successful execution under normal queue load.

Safe transport phase telemetry keeps at most8 timing summaries per session and never records URLs, headers, cookies or bodies. The first80 natural failures after deployment contained39 timeouts:34 while reading the response body,4 awaiting headers,1 before CONNECT completion. Max request deadline timer overshoot in that sample was285ms. This is a small startup sample, not proof of IP limiting or a causal diagnosis of bandwidth/decompression/CPU. Existing10-second and confirmed-CONNECT429-only retry policy remains.

Controlled source bandwidth experiment started19:21:42Z: effective FB page15/group20/user5, other effective caps unchanged. Nominal FLOW_QUEUES budgets and full-source admission remain unchanged; all eligible sources still get tickets. Baseline120s window ended19:20:14Z with332 ES records touched (includes updates),148 source job successes,1011 failed source jobs. Earliest clean after-window ends19:24:12Z after30s warmup; helpers source-concurrency-after.sh and source-concurrency-rollback.sh and decision rules are recorded in work-state.json. No throughput improvement has yet been established.

First clean120s experiment window ended19:24:26Z:132 source successes vs148 baseline,306 ES touched vs332. Composition shifted: post records155->276, comment records177->30; FBpage successes49->71 and timeout91->14, active leases111->53. Both30%-worse rollback thresholds were not met; retain provisionally and observe longer. These windows used different source inventories and do not establish an overall throughput benefit.

Live partial-delivery audit verified4 exact YouTube post IDs through the unchanged serializer and ESget; their ES insertedDate preceded the corresponding retained source counter-timeout by milliseconds. These are confirmed writes/updates, not necessarily4 new unique records. The bufferedItemsOffered field remains empty because the counter-failure fallback uses a separate import path. A sampled FB user pending row had opaque nonnumeric author/no native proof; the normal binder did not validate it, so no author guard was relaxed.

YouTube metrics header verification now preserves native API errors even insideHTTP200, rejects malformed/nonobject JSON, and reports all non200 responses explicitly. Unknown counters stay null; native exact zero still validates. This closes an error-classification gap, not the underlying timeouts. Local66passed1skipped, staging59passed; deployment19:35:38Z drained11s. No additional network retry or recovery batch.

Read-only DOM reuse optimization deployed19:50:49Z after101 local passes/1skip and66 staging passes. The one-document tree cache freezes nodes, attributes and child arrays, drops its old strong reference before parsing a different HTML string, and never caches native/API JSON objects. Internal selectors share the same Cheerio semantics; parsed JSON remains independent. A single new public native GET (different video from the stopped canary) provided one1256330-byte in-memory snapshot; two cold-cache alternating parser-chain replays per variant had equivalent identity/date/counter/pagination outputs. Mean processCPU824.6ms ->358.8ms (~56.5% lower), wall494.2ms ->257.0ms (~48% lower). These are component timings on one response, not end-to-end throughput. Backup qc-readonly-dom-backup-wlxDI1; drain10s; no concurrency/retry changes or recovery.

## Operator error policy, 28 October 2026

The user explicitly replaced the earlier confirmed-CONNECT-only retry and exact-counter requirements. `independent-rounds-operator-error-policy-v7` completes auth/login/checkpoint, missing public items/data/feed and verified pagination-stall jobs. These are recorded as skipped source outcomes, with terminal reasons retained separately in `flow_terminal_outcomes`; completion is not evidence of a successful public read. Prior failed tickets are retained.

The listed timeout, HTTP/API/server/rate-limit and expired-proxy errors rotate to another endpoint and retry, with the existing cap of ten retries after the initial attempt. Manager-unavailable requests reacquire with bounded short retry delays. Cursor and staged page state survive rotation. Generic upstream 429 is a retry instruction, not proof of an IP-specific block; shared-proxy quarantine still requires actual CONNECT evidence.

Unknown post comment counts default to 1, and other missing interaction counters default to 0. Observed exact zeros are preserved. The item carries counter-default provenance. Exhausted native comment/reply pagination can finish despite display-count mismatch or unknown display counts; missing native continuation proof and invalid parent links remain failures. Public API coverage continues describing what was actually verified.

Foreign-author Facebook page posts, as with tagged user-feed posts, use the native author for author/authorId/siteId/siteName and canonical post ID. Inventory identity remains discovery provenance; group source context is retained. Publication readers prefer exact timestamps, then bound day-only watch metadata and supported native text dates; relative text is marked estimated rather than treated as an exact second.

Bounded live staging reads recovered native dates for two previously failed YouTube videos. Two Threads profiles still repeated their initial four post IDs after an `after` request with the verified refetch operation; the public Relay module still exports doc ID 28493213377048182. Such nonprogress is a terminal skip under this operator policy. Redirect diagnostics retain public origin/path only, and feedback-target diagnostics retain expected/observed IDs without cookies or tokens.

Operator follow-up on 28 October removes equality checks between request and response feedback IDs. Facebook comment/reply requests retain their supplied numeric post and parent-comment IDs; returned opaque feedback IDs are not used to reject a usable connection or replace request IDs. Root/reply regression tests cover opaque and different numeric response feedback IDs, preserving item parent links and continuation context.

The same-day operator follow-up adds `UNSAFE_REDIRECT` to endpoint rotation. The worker preserves its native checkpoint and retries on a different proxy up to ten times after the initial attempt. Redirect allowlists remain enforced: a Google `/sorry/index` destination is not followed. The owned redirect/proxy regression confirms eleven attempted YouTube requests, ten endpoint exclusions/rotations, and eleven released leases before retained retry exhaustion.

## Operator-provided UID mapping, 28 October 2026

The user supplied an XLSX with 1,489 exact Facebook profile URL to numeric UID pairs and explicitly requested applying them to missing-UID jobs. All IDs were stored as text cells, with no conflicting URL mappings. Source SHA-256: 878c2f98ebed58e7517d7e0e1b390148c2dab0c47a7e82f92b94484eafacd608.

Only exact opaque/profile keys match. The application preserves old rows/tickets in `flow_operator_uid_updates`, backs up the source mapping and author cache privately, updates the item author ID with file/row/profile provenance, and retries or recreates its UID ticket. `operatorSuppliedUid` accepts this explicit provenance before acquiring a proxy. The normal deterministic UID-to-import handoff and ES5 identity/date/parent/mapping validation still run. Source/profile IDs are never substituted for an unknown author. The existing author cache receives the approved mappings for subsequent reads. Unmatched jobs are retained.

The initial application updated 1,790 jobs: 404 retained Bull tickets were retried and 1,386 historical Mongo tickets were recreated. Backup: `/var/lib/crawler-v8/operator-uid-mapping-backup-RfT4Ee`. Local and staging regression checks each passed 50 tests. ES verification compares the actual persisted author ID, parent ID, and publication date with the expected document; UID/import outcomes are reported separately from records that already existed.

Final verification at17:14 Vietnam time confirmed1,790/1,790 UID handoffs and1,790/1,790 expected ES5 author/parent/publication matches, with no pending or failed imports and no mismatched author IDs. No remaining UID job matched the supplied file. The live remaining inventory contained614 jobs across592 profiles outside this mapping snapshot.

### 2026-10-28: import posts without supplementary metrics requests

Source workers no longer call per-post metrics when a source response omits comment counts. The existing import boundary defaults missing comments to 1 (and other missing counters to 0), preserves known zero/positive counts, and immediately offers each valid post to `es5-import` before continuing pagination. This applies to all configured source platforms. Date/identity import validation and ES acknowledgement before publishing comment targets remain in force. Removed the obsolete supplementary-metrics reader and counter-lookup predicate. Local related checks: 29 passed; production staging checks: 19 passed. Production backup: `/var/lib/crawler-v8/counter-default-backup-1edgp4ua`.

### 2026-10-28: rolling background proxy admission

The shared manager now reserves 4 API-only keys. Of the 46 crawler keys, 23 accept new leases and 23 wait in persistent circular order. Limit reports request replacement without quarantining crawler scopes; only a successful fresh provider acquisition retires the old admission key. Waiting keys with active leases or provider cooldown are skipped. Existing leases drain on their original IP/generation. No new crawler lease is admitted with <=60 seconds provider TTL remaining. See `docs/proxy-manager-vi.txt` and `test/background-proxy-ring.test.mjs`.

### 2026-10-28: unrestricted proxy sharing

Operator requested no manager-imposed sharing limits. Production now enables `unrestrictedSharing`: no per-key/scope pacing, per-key lease cap, or aggregate background lease cap. Per-flow worker concurrency, ring admission, API reservation, provider cooldown, existing-lease draining and the 60-second crawler TTL cutoff still apply. Four recent pacing-failed jobs were restored with their checkpoints and an audit record.

### 2026-10-28: confirmed empty Facebook source is terminal

A target-matched, fully completed Facebook bootstrap timeline with zero posts and explicit has_next_page=false is now done by policy as PUBLIC_ITEMS_NOT_RETURNED, without proxy retry. Page reads bootstrap through the verified profile alias when available. Complete prefetched stream proof is required; missing/error/unfinished feeds are not inferred empty. Applied generally to initial Page/User reads and verified live on page 215664340449620 / profile 100075962508723. Source remains eligible for future rounds.

### 2026-10-28: restore declared workers and 60-second HTTP timeout

Operator requested HTTP timeout 60 seconds and execution concurrency equal to all declared queue budgets. FLOW_READ_TIMEOUT_MS is now 60000; FLOW_READ_ATTEMPT_TIMEOUT_MS is 180000 so a multi-request read (bootstrap, GraphQL, detail) is not cut off by the previous 30-second budget. Both source/comment runtime and UID HTTP executor use these values. The existing ES5 client shares the 60-second request limit. Mongo timeouts are unchanged.

Removed the separate FLOW_READ_CONCURRENCY cap: flowWorkerConcurrency now returns spec.workers. Effective budgets are Page30, Group60, User10, InstagramSource5, YouTubeSource5, ThreadsSource5, FacebookComment150, FacebookReply70, InstagramComment5, YouTubeComment30, ThreadsComment5, ES5Import20, FindUid3: total398 (375 crawler reads plus20 import plus3 UID). Actual active jobs depend on queue demand. Proxy manager reservation/ring/unrestricted-sharing configuration is unchanged.

Systemd TimeoutStopSec is240 seconds to allow a current180-second read to settle and save state on graceful restart. Local and staging checks:69 passed each, including HTTP executor limits, exact worker budgets, shutdown/checkpoint handling, empty-source recognition and integration with the shared production manager. systemd-analyze verify passed. Backup: /var/lib/crawler-v8/timeout60-workers398-backup-64xyvvn7. Evidence: outputs/timeout60-workers398-2026-10-28/.

Production verified after restart at21:02:15 ICT: flow_started reports60000ms HTTP /180000ms read; flow_status reports every queue at its declared concurrency. Observed322→357→354 active jobs over40 seconds, including Page30/Group60/User10/FacebookComment150. Service/manager/API active with zero failure restarts; crawler memory approximately1.1GB and whole-server CPU22–29% at check. Import20 workers were saturated; waiting imports81→171→296 during samples. Existing network/reset failures remain: the post-deploy log sample contained181 job_failed events, chiefly NETWORK_ERROR/UPSTREAM_NETWORK_ERROR/ECONNRESET, plus missing UID/comments unavailable; no fatal worker/flow/counter errors observed. This verifies deployment/configuration, not resolution of upstream connectivity or stable throughput.

### 2026-10-28: policy v8 terminal unavailable comments and connection resets

Operator set COMMENTS_UNAVAILABLE and ECONNRESET to done/skipped without proxy retry. ECONNRESET is recognized directly and through upstreamCode on NETWORK_ERROR/UPSTREAM_NETWORK_ERROR. The terminal audit reason is normalized to ECONNRESET while the wrapped reason remains in upstreamReason. HTTP transport preserves sanitized native error codes so reset is not lost in the generic network classification. Other network errors, response errors and UPSTREAM_TIMEOUT retain their existing policy; HTTP60s/read180s and398 declared worker concurrency are unchanged.

Error provenance: UPSTREAM_API_ERROR comes from native JSON error envelopes, including HTTP200 responses; UPSTREAM_HTTP_429 comes from an actual HTTP429 response on the platform request (proxy CONNECT429 is PROXY_CONNECT_RATE_LIMITED). NETWORK_ERROR is the Facebook transport classifier; UPSTREAM_NETWORK_ERROR is the shared transport fallback for failed requests/response reads. Neither generic network label by itself proves the proxy is faulty.

Checks: local86 passed, one zstd test skipped on Node20; staging87/87 passed on production Node24. Backup: /var/lib/crawler-v8/terminal-reset-comments-backup-s5afpnnv. Evidence: outputs/terminal-reset-comments-2026-10-28/.

### 2026-10-28: policy v9 API errors terminal, network errors rotate

Operator set UPSTREAM_API_ERROR to done/skipped. UPSTREAM_HTTP_429 retains proxy rotation; NETWORK_ERROR and UPSTREAM_NETWORK_ERROR now also rotate/retry, at most10 endpoint changes after the initial attempt. Native/wrapped ECONNRESET remains terminal and takes precedence over the generic network label. COMMENTS_UNAVAILABLE remains terminal. Timeout60s/read180s,398 worker budget, cursor/partial-item preservation and proxy ring settings remain unchanged. Local and staging:55/55 checks passed in each environment, including immediate API completion,11-read/10-rotation exhaustion for the three selected codes, and reset precedence. Evidence: outputs/api-network-policy-v9-2026-10-28/.

### 2026-10-28: policy v10 connection reset rotates

Operator changed ECONNRESET from terminal to proxy rotation/retry, with the existing maximum10 endpoint changes after the initial read. Direct reset and a preserved upstreamCode=ECONNRESET on generic network failures both rotate; reset no longer gets rewritten into a terminal outcome. Existing explicit terminal reasons (including UPSTREAM_API_ERROR and COMMENTS_UNAVAILABLE) and authentication outcomes remain terminal. HTTP60s/read180s,398 worker budget and proxy manager settings are unchanged. Local55/55 and staging55/55 checks passed, including direct/wrapped reset exhaustion at11 reads and10 rotations plus recovery on a different proxy. Evidence: outputs/reset-rotate-policy-v10-2026-10-28/.

## Retry budget update — 29 October 2026

Operator increased FLOW_RETRY_LIMIT from 10 to 100 for the existing retryable read errors. This is one initial attempt plus up to 100 retries, sharing the persisted job budget. Manager-unavailable backoff remains min(1000 ms, 100 ms × retry count). Existing failed jobs are retained and are not automatically requeued.

### 2026-10-29: validated ES5 bulk import

Import retains 20 active Bull jobs and the existing native identity, author, parent, publication, URL and ES mapping checks. Only validated documents reach the bulk writer through `commitCrawlDocument`. Batches contain at most 20 items / 5 MiB of NDJSON; a partial batch flushes within 10 ms instead of waiting for additional traffic. Oversize documents fail before submission. ES requests retain the existing 60-second timeout and no automatic retry.

Each response item must match the requested index/type/id, have status 200/201, a created/updated result and a positive version. Missing/truncated responses fail the affected batch; per-item errors fail only their job and preserve ES status/error in `flow_jobs.esImportError`. No failed item publishes a comment target or increments the indexed counter. Successful jobs are removed only after their own acknowledgement and any required post-target update. Active job shutdown continues to wait for these promises, including timer-flushed partial batches.

Local and production staging checks each passed 69 tests. Deployed at approximately 20:01 ICT; backup `/var/lib/crawler-v8/import-bulk-backup-VpJDry`. Initial live verification observed 222 bulk requests / 896 items with zero bulk failures and no worker/counter errors. Over 20.35 seconds, indexed increased by 609 (about 30/s) while waiting decreased 19,425 → 18,898 with crawlers running. Three just-indexed Facebook group comments were read back from ES5 with author IDs, parent IDs and publication dates. This is a short observation, not a sustained throughput guarantee. Service active, zero automatic restarts.

### 2026-10-29: import backpressure and ES5 indexing-failure attribution

A follow-up three-minute baseline (21:27–21:30 ICT) showed import waiting rising 30,407 → 30,726 at roughly 17 indexed documents/s. ES5 stayed green with zero bulk/index rejections. Cluster-wide indexing failures were not crawler bulk failures: a ten-second typed primary-stat sample on `master202644` recorded 13,303 failures, including 12,649 `tiktokComment`, 284 `tiktokTopic`, 186 `youtubeComment`, 103 `ecommerceComment`; `fbGroupComment` had zero failures and 114 successful indexing operations. The flow queues do not crawl TikTok or ecommerce. Recent successful TikTok records carry `ds.source=crawler-v7-tiktok-comment-v9-ssh`; this identifies a writer provenance candidate, not definitive attribution of failed requests.

The older local TikTok importer at `crawler-v7-titktok-2023/src/services/insert/index.ts` uses bulk `create` and ignores per-item responses. Duplicate creates/version conflicts are a plausible failure mechanism, but the deployed worker's error response/log is still required to confirm that mechanism and identify its process/host. The available ES5 SSH accounts did not authenticate, so no server log was available. The aggregate counter alone does not identify error reasons or client addresses. Short hot-thread samples on hot-3 showed Lucene multi-term search work, not a blocked indexing pool. No external TikTok worker or cluster configuration was modified.

Import preparation concurrency is now 80 jobs, while the bulk writer permits at most two concurrent HTTP requests. Pending validated rows coalesce under backpressure; every emitted batch remains bounded to 80 items / 5 MiB. The 10 ms partial-batch flush, per-document native/mapping/parent validation, per-item acknowledgement, retained error payloads and acknowledgement-before-comment-target rules remain. Source/comment/reply/UID worker budgets are unchanged. Extra tests verify in-flight limits, coalescing, no early acknowledgement and byte caps under backpressure; local and staging each passed 71 tests. Backup `/var/lib/crawler-v8/import-opt-backup-VZFmWF`.

After deployment, seven 30-second samples from 21:42:31–21:45:31 ICT showed waiting 28,523 → 27,285 → 25,947 → 24,797 → 23,291 → 21,835 → 20,350, with 10,622 documents indexed in 180.343 seconds (58.9/s). All six intervals decreased; import failed/delayed remained zero. Since the service restart, 915 bulk batches / 13,139 items had zero failures, p50 265 ms / p95 750 ms / maximum 1,724 ms, with no worker/counter errors or automatic restarts. ES5 remained green, no indexing throttle or bulk rejections, and no additional breaker trips. Existing hot-node heap pressure around 81–87% and the unrelated global indexing failure stream remain unresolved; this is an observed sustained drain over three minutes, not a guarantee for future load.

Final check at 21:45:50 ICT: waiting further decreased to 19,268. The writer had sent 14,518 items in 1,007 batches with zero bulk failures; observed maximum batch size 67 and maximum in-flight requests 2. An ES get confirmed a just-indexed Facebook group comment existed with author, parent and publication fields. Two new retained import failures were `EXACT_PUBLICATION_DATE_REQUIRED`, rejected by the unchanged validation before ES submission; these are not bulk/ES failures. No validation was relaxed to clear them.

### 2026-10-30: detailed error taxonomy and fresh-failure reporting

The operator requested separate error identities for every distinguishable failure, a backed-up clear/retry of all failed tickets, and a one-time 04:00 ICT report with explanations and 1–2 real cases per error. The thread automation is `t-ng-h-p-l-i-crawler-l-c-04h`, configured once at 04:00 on 30 October 2026 in the user's Vietnam timezone.

`crawlerErrorDetails` assigns a distinct code plus a full-dimension group key. Dimensions include queue/platform, original reason, phase, native code, CONNECT/HTTP status, upstream API code, operation/query/stage, exception type, terminal reason, encoding/wire completion and ES error/cause/field. Long display codes carry a hash; full dimensions remain in the event and job data. Unknown phases/native causes remain explicit and are never guessed to be proxy blocking or origin refusal. DNS/TCP errors, CONNECT, TLS, headers, body and decoding failures remain separate. Transport acquisition/permit/heartbeat/read-deadline phases are observable separately from wire phases. Retry/rotation decisions continue to use the original results and unchanged budget; the new labels do not alter retry or validation policy.

`flow_error_events` durably retains sanitized request errors, failed read attempts/retries, terminal job failures and runtime/partial-delivery exceptions even after successful Bull tickets disappear. `request_error`, `read_retry`/`read_failure` and `job_failed` are different counting levels; do not add them together as failed HTTP requests. Worker logs mirror the events; `error_event_store_failed` flags failed persistence and requires the journal fallback. The main worker stores detailed `failedReason` and `lastReadError` while preserving `originalReason`. The local UID worker uses the same event collection and separates curl proxy/origin DNS, connection, TLS/certificate, timeout, receive/decode/size-limit failures and HTTP codes. Its localhost curl TLS/receive errors do not prove whether a proxy or origin caused the failure. Public case URLs keep content identity parameters (video/comment/profile IDs) but drop authentication parameters, credentials and fragments. Raw response bodies, cookies, proxy credentials and error messages are not logged.

Local regression checks: 107 passed / 1 environment skip; production staging: 108 passed, zero skipped. Additional UID/classifier checks: 21 passed. Existing worker-budget test was corrected to the already deployed 458 total slots (80 import), not a budget change in this rollout. Production code backup: `/var/lib/crawler-v8/error-taxonomy-code-backup-2URtkz`.

Reset operation: `/var/lib/crawler-v8/error-taxonomy-reset-FXqVtp`. Read `state.json`, `backup.json`, `manifest.json`, `progress.json`, `history-clear.json` and `baseline.json` there for authoritative completion/counts. The runner pauses all thirteen queues and drains the main and local UID workers; stores gzip EJSON backups of all Mongo failed records and full failed Bull ticket payloads; reads both backups back, verifies counts and SHA-256; retries existing failed Bull tickets with fresh retry budgets and preserved checkpoints; and removes only historical Mongo failures with no remaining Redis ticket whose ID/error/failedAt still match the verified backup. Existing Redis tickets are preserved. Historical tickets previously removed by operators are not recreated en masse. The fresh report window begins at `baseline.json.at`. New failures after resume remain visible; they must never be cleared again just to make the queue display empty.

For the 04:00 report, source `/etc/crawler-v8/runtime.env` on the crawler host and run `/opt/crawler-node/bin/node scripts/report_crawler_errors.mjs --since=<baseline.at> --until=<report-time>`, saving JSON under the operation directory. Include journal `flow_error`/runtime/storage-error events when persistence is incomplete, and relevant local UID `outputs/local-uid-worker-2026-10-29/worker.log` records. The report emits separate groups, kind counts, up to two real cases with sanitized context, queue states and counters. Compare counter deltas with the baseline rather than interpreting lifetime counters as fresh failures. Explain each observed type in Vietnamese, evidence limits, impact and suggested action; mark missing examples explicitly. Report only this crawler's events, not global ES5 counters from unrelated pipelines. Save the user-facing report under docs and link it in this chat. Pause the one-shot automation when done.

Reset safety incident: the first run `error-taxonomy-reset-FXqVtp` stopped before retrying/deleting anything when Node 24 readline split a valid embedded U+2028 in a historical post at record 17,806. Independent Python validation read all 375,722 JSONL records successfully. The recovery trap resumed the main service. `readFailureBackup` now frames gzip EJSON strictly on literal LF, preserving U+2028/U+2029, multiline Unicode content, BSON Long values and dates; malformed-file errors expose only record number/type. Regression tests passed on production Node. The initial operation is not the final report baseline; always resolve `/var/lib/crawler-v8/error-taxonomy-last-reset` and verify its state is completed.

The final runtime additionally separates import enrichment, native validation, ES mapping lookup, mapping validation, parent validation, bulk write and Mongo target publication. Wrapped validation/mapping errors preserve their cause/status/type; unclassified runtime exceptions include their call-site so different TypeErrors are not merged. Final full staging suite: 111/111 passed. The second reset operation is `/var/lib/crawler-v8/error-taxonomy-reset-XX2Rsp`; check its completion manifest and use its baseline for 04:00.

Final reset confirmed completed at 00:46:47 ICT on 30 October. Both backups verified all 375,722 Mongo records and 2,224 full Bull ticket payloads. Mongo backup SHA-256 `4eff485ce10a1f727e500513d4cd4a497e3da42660fa874bc85d805c72b5d4aa` (587,254,438 bytes); Bull backup SHA-256 `daa97f3a8d6ecf97d7a49d1c09120ecd8bc411061c293e62d54dd1584c1b2904` (22,662,939 bytes). All 2,224 captured tickets were retried: zero skipped, zero dispatch errors. Removed 373,498 historical Mongo failures with no Redis ticket; preserved all 2,224 retried tickets and checkpoints. Remaining Mongo failed count was zero before resume. Main service active with no automatic restarts; local UID worker/tunnel restarted at configured concurrency 20 and were waiting for global queue resume. New failures after this baseline are expected to remain for diagnosis.

Live report smoke test after resume succeeded. Fresh baseline is exactly `2026-10-29T17:46:47.308Z` (00:46:47.308 ICT on 30 October). `first-errors.json` is saved in the final operation directory. Initial observed kinds: 342 request_error, 577 read_retry, 37 read_failure and 9 terminal job_failed events; these are overlapping observation levels, not 965 distinct failed requests. No error group used a bare `ECONNRESET`, `NETWORK_ERROR` or `UPSTREAM_NETWORK_ERROR` label. Observed labels distinguish HTTP-200 bootstrap auth gates from TLS resets during bootstrap/comments, with per-queue context, exact job/source/post identities and timings. All thirteen queues had paused=0 and main service active/NRestarts=0. Nine jobs had freshly failed again (two import, seven UID); retain them and their new diagnostics for the 04:00 report rather than clearing them again.

Final isolation fix: shared rejected Error objects from bulk calls or UID single-flight lookups are now classified into per-job copies, preserving the original evidence and Bull UnrecoverableError semantics. They are never mutated/relabelled in place. The added regression cases brought the full production staging suite to 113/113 passing. Main service was gracefully restarted and local UID worker/tunnel reloaded without another reset/retry. Three previously double-labelled UID events/jobs were backed up in `diagnostic-label-corrections.ejsonl` in the final operation directory, then corrected against the five matching canonical UID events; counts, event IDs, timestamps, job payloads and states were preserved. Each correction retains previousCode/previousOriginalReason and a reason/clock stamp. The report baseline remains 00:46:47.308 ICT; do not move it to the later code reload.

### 2026-10-30: TLS/UID diagnosis and Facebook reply session reuse

Deployed with backups `/var/lib/crawler-v8/tls-uid-reply-opt-ERwIDz` and final `/var/lib/crawler-v8/tls-uid-reply-opt-Et6yq3`. Production Node24 staging passed 129/129 checks. Controlled fresh packet captures identified eight failed tunnels: CONNECT200, complete ClientHello ACK, peer-first FIN, zero TLS response bytes, no peer RST or payload retransmission on the observed leg. This locates the observed failure in the proxy tunnel or its downstream path; provider backend logs are still needed to identify the component.

Crawler origin TLS negotiation now has a separate 15-second stage bound after socket assignment. HTTP60s/read180s, retry100, all worker budgets, native identity/date/parent/cursor validation and per-item ES bulk ACK remain unchanged. The application deadline reports `PROXY_TLS_HANDSHAKE_TIMEOUT`, never a fabricated native ECONNRESET. Header/body/decode and established TLS sockets retain their existing budget; the API defaults outside this crawler are unchanged.

A bounded in-memory pool transfers exclusive ownership of healthy managed Facebook comment sessions. Same-target jobs can reuse their live bootstrap context; cross-target reuse requires the same `facebook.comments` lease scope and discards old request/context/author maps before bootstrapping the new target. IdleTTL30s, max70 idle sessions, retry endpoint exclusions and lease-expiry guards apply. Failures, terminal/busy bindings and near-expiry leases are not shared. Pool eviction and graceful shutdown release leases. Native page jobs, outbox, cursors and validation are unchanged; credentials/session data never enter checkpoints.

External UID worker errors now distinguish HTTP200 ErrorRoute, profile route without UID, unexpected route, missing payload/target route, login/checkpoint and each HTTP status. Failure evidence retains sanitized route metadata, SHA256, decoded bytes and elapsed time; no HTML/cookie/token/viewer IDs enter error logs. A missing-proof HTTP200 permits one additional proof-checked GET, with explicit failure/retry observation. HTTP/security errors are not covered by that reread, and native UID conflicts remain failures. New UID failures increment the shared failed counter; historical missing increments are not backfilled. Old failed tickets were not cleared/retried in this change.

Final measurement 07:47:11–07:50:11 ICT: reply waiting **9007→8989→8937→8873→8817→8777→8727** (six decreasing 30-second intervals), active70, failed0 throughout. There were468 completed reply tickets, including3 existing-policy skips; completion is not a unique ES-insert count. Pool used73 same-target contexts and470 same-scope transports. ES bulk acknowledged3398 write/update operations with zero item errors; ES green, all node bulk queues/rejections zero at the last check. These are short-window observations, not a guarantee for later source-round bursts. Full diagnosis, limits, UID cases, exact queue samples and readback evidence: [report](/Users/phuctran/Workspace/crawler-2026/docs/crawler-tls-uid-reply-2026-10-30.md).

### 2026-10-30 08:16 ICT: read-only follow-up

No code/policy/service/job mutation by this check; the eight runtime file hashes still match the final deploy manifest. Reply waiting fell8690→8645→8591→8538→8513→8472→8431 across six fresh30-second intervals, active70/failed0. The longer07:50–08:16 window was not monotonic: waiting first reached8302, then rose to8867, and ended8431 versus8727 at the previous cutoff. Do not extrapolate the short steady-drain window to the whole period.

No new proxy_tls groupKey appeared. The window contained1634 request_error observations for the application TLS deadline and352 native TLS ECONNRESET observations; read_retry records are separate levels. Newly recorded UID ErrorRoute HTTP200 involved three job failures/four failed GET observations for one profile; the counter increment matched3. Redis independently recorded1793 UID retries at08:12:48, import cleaned3 at08:13:08 and UID cleaned3 at08:13:28; no matching standard manual-retry operation was found, and the actor remains unknown. These actions were not issued by this check; zero Bull failed counts do not mean historical validation/UID problems were repaired.

Bulk1813 batches/29595 write-update ACK operations had zero item errors, p95796ms; ES green and all node bulk queues/rejections zero. Five ordinary reply payloads matched ES author/parent/publication/URL fields after recheck; all five had a fresh insertedDate. Full evidence, twenty newly observed context groups and redirect-provenance limitations: [08:16 follow-up](/Users/phuctran/Workspace/crawler-2026/docs/crawler-followup-2026-10-30-0816.md).


### 2026-10-30 09:03 ICT: reply TLS stability and mutation attribution

The session pool now retains multiple healthy bindings per target; active reply read retries can borrow a healthy same-scope binding on another endpoint. Exact-target contexts are session/cookie-version bound, TTL60s/max8 per binding; pool idleTTL30s/max70. Context selection never borrows another target’s actor map. Native import validation and per-item bulk ACK remain unchanged.

Bull Board mutations now write durable authenticated HTTP audit before execution; independent Redis mutation events and persisted checkpoints cover13queues. At08:55:01 an admin/Chrome-family HTTP client from118.69.109.6 retried7find-uid tickets; older08:13cleans remain unattributed. Reply waiting5199→4172 across21samples/20decreases08:52–09:02, including a source-refill deploy restart from the separate chat. Stable post-restart sample4477→4172, active70/failed0. TLS deadlines remain observable, not cured upstream. Production183/183tests, liveES5full-field5/5readbacks, bulk11097operations/0item errors. [Detailed report](/Users/phuctran/Workspace/crawler-2026/docs/crawler-tls-reply-stability-2026-10-30.md).


### 2026-10-31 16:47 ICT: temporary TLS endpoint avoidance and durable retry history

Explicitly authorized deployment to54.39.111.29. A TLS handshake deadline, or CONNECT200 plus an observed TLS-phase reset/pipe/timeout, temporarily excludes that endpoint from new manager assignments across scopes for120seconds. The manager persists this transport-health state across restart; it does not label TLS failure as proven origin rate limiting, terminate healthy existing leases, or permanently disable a key. Reports include sanitized phase/native-code/CONNECT evidence. Auth, HTTP and body failures alone do not trigger TLS avoidance.

Each flow job also persists endpoint hashes and five-minute failure expiry times in its Mongo/Bull data. Manager acquisition and Facebook session borrowing honor the complete live exclusion list, rather than only the immediately preceding endpoint. An exhausted eligible pool returns `PROXY_ENDPOINTS_UNAVAILABLE`; the worker saves its public reader state and delays the same Bull ticket without consuming an upstream read retry or failing the source. Native cursor, seen IDs, pending page, source round and retry budget remain. A dedicated delayed sentinel avoids BullMQ5's generic delayed-error path fetching another job during shutdown. Deferred tickets remain busy for duplicate prevention but do not block admission of other eligible sources when waiting is empty.

Node24.22.1 staging passed263/263 tests, zero skipped, including isolated real Redis/Bull ticket delay/resume and two TLS rotations with exact source cursor continuation after checkpoint reload. Staging uses the manager/router dependencies from the actual API runtime and the crawler dependencies from its runtime. The existing abort-release test now waits for its release event rather than assuming a40ms scheduling deadline.

Deployment backup and evidence: `/var/lib/crawler-v8/proxy-avoidance-20261031-MKwH5A`. Main crawler drained before installing; manager restarted first, crawler resumed16:47:16 ICT. Both active, NRestarts0. Fourteen installed runtime file targets passed hash checks, including the existing manager ring dependency copied into the crawler runtime. Before resume, all16,465 pending read tickets—including13,100 saved checkpoints—had identical cohort hashes across installation (`255e6ce601a5ba0e89cdd060ea827d4d8c0bb87833a68643082dbdaf10c1b8d2`).

Seven live samples16:48:05–16:51:14 showed all115 source slots active, no paused queues and no new terminal-failure counter increments. There were360 source read-retry observations,360 distinct job/endpoint pairs and zero same-job endpoint reuse within five minutes. Six endpoints were temporarily avoided at the final sample. Of104 pre-restart source tickets with saved checkpoints,102 advanced a page or settled:50 success,25 policy skips,29 still running; no missing ticket without an outcome. Facebook page source admitted its next2,695-source round at16:50:04 while earlier active sources continued. This is short-window behavioral evidence, not a sustained throughput guarantee.

At16:51:07,437 bulk batches /5,881 acknowledged write-update items had zero item failures and no worker/feeder/counter/persistence errors appeared in the deployment journal. Three fresh ES5 post gets matched native publication and URL, with author/site IDs present. Natural all-endpoint exhaustion was not observed; its delay/resume behavior is covered by the Node24 staging integration test. TLS/connect/auth errors remain visible.

Concurrent external action: Bull Board audit recorded an authenticated admin/Chrome retry of3,484 UID failed tickets at16:48:10 ICT, independently confirmed by Redis failed-to-waiting events. This deployment did not issue that retry or any clean action. UID failed-count reduction and total import traffic must not be attributed entirely to the proxy change. Local detailed evidence: `outputs/proxy-avoidance-deploy-2026-10-31/summary.json` and `evidence.json`.


### 2026-10-31: read-only 15-minute source-throughput follow-up

Fixed baseline16:31:34–16:46:34 ICT immediately before crawler drain, compared with17:04:36–17:19:36 ICT after warmup. The latter was measured by an independent900-second read-only collector with16 one-minute health samples. Mongo `flow_source_round_results.finishedAt` supplies the exact equal-duration outcome windows. Settled tickets include success, policy skip and failures; successful public-read outcomes remain separate.

| Source | Settled before/after | Throughput change | Successful before/after | Estimated full inventory minutes before/after |
|---|---:|---:|---:|---:|
| Facebook page |217/217|0.0%|211/205|188/188|
| Facebook group |187/358|+91.4%|80/94|676/353|
| Facebook user |54/77|+42.6%|53/73|492/345|
| Instagram |5/11|+120.0%|5/10|738/335|
| YouTube |7/4|−42.9%|7/4|1189/2081|
| Threads |35/72|+105.7%|28/64|296/144|

Aggregate settled505→739 (+46.3%), successful384→450 (+17.2%). Source read-retry observations at TLS phase852→293 (−65.6%); total read retries1657→1388. These are event counts at the read-retry level, not HTTP error-rate denominators. Group skip outcomes107→264 account for most of its larger turnover gain; successful-source throughput increased only17.5%, and mean pages of its completed successful jobs changed5.88→2.91. Page turnover was flat, not an improvement.

All115 source slots stayed active across16samples; no pause, automatic service restart, runtime worker/feeder/counter/persistence error or queue-board mutation was observed in the comparison windows. IG and YouTube have fewer than20 settled tickets and are particularly noisy. Full-inventory times are eligible inventory divided by the measured15-minute settlement rate, not fully observed post-change rounds. The one completed page round in this interval began before deployment and cannot establish a post-change round duration. Proxy generations, source/work mix and concurrent traffic differ, so do not attribute the full difference causally to endpoint avoidance.

Collector/evidence: `/var/lib/crawler-v8/proxy-avoidance-15m-20261031-ewj8OD`; local report `outputs/proxy-avoidance-15m-2026-10-31/report.txt`, structured `comparison.json`, full `evidence.json`. No service/config/job mutations were performed by this follow-up.

### Local UID worker persistence (2026-11-02)

The Mac worker and SSH tunnel are supervised separately by user LaunchAgents
`vn.crawler.local-uid.worker` and `vn.crawler.local-uid.tunnel`. Both use
`KeepAlive`, a 10-second restart throttle, and start at user login. They do not
prevent system sleep; no work runs while the Mac is asleep or logged out.
The current local concurrency is 3, stored in `settings.json`; the worker reads
this every second and at startup, taking precedence over the launch environment.

Install after gracefully stopping unmanaged processes with
`node scripts/install_local_uid_service.mjs`. Use
`node scripts/local_find_uid_control.mjs start|stop|status|scale N` afterward.
An explicit `stop` unloads the services so KeepAlive does not undo an intentional
stop; `start` loads them again. Killing a worker process without unloading its
service results in an automatic restart. Credentials stay in existing private
local files and are not included in service arguments or environment variables.

Control commands append timestamp, action, PID and parent PID to private
`control-audit.jsonl`. Worker/tunnel shutdown logs record the received signal.
The old worker received SIGTERM or SIGINT at 09:34:09 local time on November 2;
Redis connection refusals followed. Historical logs do not identify the sender,
and neither the inspected launch agents, crontab, shell history nor available
session/unified logs establish one. Do not attribute this to Facebook rate
limiting or a network-triggered shutdown without further evidence.

### 2026-11-02 13:47 ICT: Facebook source anonymous context fallback

Source reads no longer terminate solely because target HTML redirects to a generic login page. On an unconfirmed HTTP200 login bootstrap, the source reader obtains fresh anonymous context from the public Facebook root in the same proxy/session, then lets the native feed determine access. Generic login context requires explicit USER_ID=0 plus a fresh LSD; captured Chrome cookies/tokens are not installed or persisted. Native auth/security/rate errors, confirmed restrictions, empty-source proof, comment/reply behavior and import validation retain their guards. The fallback also applies when restoring source cursors after a session change.

Controlled comparisons showed the supplied request works under Node HTTP without Chrome cookies, and existing HAR queries work with fresh context. Background canary on group997265710295664 encountered a target login redirect, then returned six posts across two cursor pages on one lease. Local282passed/1environment skip; Node24staging283/283passed. Deployed two files with hash/owner/mode guards, gracefully restarting only Page/Group/User source workers and preserving16Mongo/Bull checkpoint samples. Source concurrency45/160/35 and unrelated PIDs unchanged. Post-deploy all three roles active/NRestarts0; three fresh ES5group-post readbacks matched publication/URL/siteId with author IDs. Native rate limits remain; no whole-inventory SLA claim. Backup `/var/lib/crawler-v8/source-context-fix-20261102-a/`; detailed report `docs/facebook-source-context-fix-2026-11-02.md`.

### 2026-11-02 15:35 ICT: import old posts, suppress old-post comments

Operator now requires posts older than72hours to remain eligible for ES import while their comments/replies are not read. Removed the source-loop age skip and both writer OUTSIDE_ROLLING_WINDOW skips. Existing identity/date/author/mapping/per-item ACK validation remains. The72hour cutoff still controls source pagination exactly as before; this does not enable an unlimited historical backfill.

After ES ACK, an aged post cannot create a comment target; an existing target is disabled without falsifying native counters. Comment candidate selection requires a parent publication within72hours, independent of recent comment activity. Every comment/reply native-read attempt rechecks parent age, so queued tickets and retries complete by POST_OUTSIDE_COMMENT_WINDOW without another read when the parent ages out. Existing ES comments are not purged.

Local356/356passed; Node24focused103/103passed, with3pre-existing broad-suite failures documented. A real17September FPT group post was validated, bulk-written and read back from ES5 with11native comments retained as a counter but0comment reads/jobs/targets. Deployed3files with hash/owner/mode guards, restarting9server roles and preserving16Mongo/Bull checkpoint samples. At15:38 all roles active/NRestarts0, profile30hashes matched;55old-comment tickets had completed by policy and0old posts matched the scanner. Natural workers also wrote old26–30October posts to ES with no comment target. Existing BullMQ extendLocks events remain, with matching pre-deploy provenance. Backup `/var/lib/crawler-v8/old-post-import-no-comments-20261102-a/`; report `docs/old-post-import-no-comments-2026-11-02.md`.


## Create-only ES5 import — 2026-11-02, 17:41 ICT

Bulk now uses `create`, preserving an existing document with the same index/type/native ID. An identity-matched per-item409 `version_conflict_engine_exception` completes as `skipped:true, reason:ES5_DOCUMENT_EXISTS`, without retry or parent-target publication. Conflicts are not ES write acknowledgements and cannot publish fresh source metadata/counters into a parent target. The worker increments `duplicatesSkipped` separately; `indexed` increments only for confirmed new creates after this deployment. Batch telemetry reports `created`, `duplicates`, `failed` and `retries`.201/created with a positive version is required for a new create. Existing transient429/502/503/504 and selected transport failures retain bounded retry;400/unknown409 and mismatched item identity remain failures without retry.

Native ID/author/date/mapping validation, views fallback0, first-page/pinned pagination exceptions and the72-hour comment gate remain. Batch limits80items/5MiB, flush10ms and HTTP concurrency2 are unchanged.65/65 Node24 staging tests passed; a real existing post remained version3 and a real native queued post was created at version1 then skipped on repeat at version1, with0duplicate retries. Three runtime files were deployed at17:41:18, with16checkpoint samples preserved and32profile hashes checked. Backup/evidence `/var/lib/crawler-v8/create-only-import-20261102-a/`. ES had already returned503/no_shard_available and red/initializing shards before deployment; this change does not claim to repair that independent cluster condition.

Production verification at17:42:35: all9roles active,32profile hashes match, existing canary document still version3 with one create call and0retries. Since deploy,1,151new creates and15,556duplicate skips across1,072batches, with0failed items/0retries and no new import job_failed events. The30-second counter sample recorded533new creates and6,132duplicate skips; no failures. ES recovered to green with all shards active. Evidence `outputs/create-only-import-2026-11-02/verification.json`.

Local UID health probes use `healthProbeTarget` from private refresh status.
Phúc 3 was verified on 2026-11-04 against `https://www.facebook.com/zuck`
(native UID 4) and a real worker target with the same previously proven UID.
The old control profile can return unavailable content for this account;
that response alone does not establish an account-wide block. Candidate
validation can receive the canonical public profile URL as the third argument
to `refresh-selected-profile.mjs`; author URL validation, native UID matching,
login/checkpoint and conflicting-identity guards remain required. A failed
candidate must retain the applied browser profile in refresh status.


### 2026-11-04 09:48 ICT: endpoint exhaustion preserves the same delayed ticket

`boundedProxyRead` now treats the exact `PROXY_ENDPOINTS_UNAVAILABLE` reason as a scheduling wait even after earlier bootstrap/redirect requests used a proxy or transport metadata is absent. The existing handler saves the reader checkpoint and delays the same Bull ticket without spending another read retry. Group concurrency remains160. A one-file deployment preserved all9,514 pending read tickets, including4,725 checkpoints, and64 Mongo/Bull checkpoint samples across installation. Fifty naturally delayed Group tickets returned to waiting with checkpoint/page/round/retry budget unchanged; no post-deployment endpoint-exhaustion terminal failure was observed in the bounded verification window. Focused Node24 tests57/57passed; broad296/297 with one confirmed pre-existing Mongo error-classification failure unchanged from baseline. Details: [deployment report](endpoint-exhaustion-delay-2026-11-04.md).


### 2026-11-04 11:08 ICT: Group checkpoint continuation scheduling

Group-only scheduling registers newly delayed source checkpoints in a due-time resume lane, selects only ready waiting tickets, and reserves at most four resumes per FIFO slot. A batch must leave waiting before another is inserted. BullMQ retains native promotion/deadline/lock/attempt/pause behavior; payloads and native cursors are untouched. Final installation preserved 8,146 pending tickets, 4,928 checkpoints and 64 Mongo/Bull payload samples; concurrency remains 160. Node24 focused 69/69 passed; broad 308/309 with the confirmed pre-existing Mongo getter-only classification failure unchanged.

In the exact 11:09:02-11:24:02 ICT window, 98/98 newly delayed checkpoint tickets resumed, 94 advanced pages and 15 completed; median deadline-to-active 44.793 s, p95 60.157 s, max 62.484 s. Overall Group: 134 success/0 failed, with 223 source admissions; pending 8,146 -> 8,235. This proves continuation scheduling, not sustained overall throughput improvement. Report: `outputs/checkpoint-resume-scheduling-2026-11-04/final/report.txt`. Backup: `/var/lib/crawler-v8/checkpoint-resume-scheduling-20261104-b/`.
