# Preserve flow jobs on proxy endpoint exhaustion — 2026-11-04

Deployed at 09:48:05 ICT (02:48:05 UTC) to 54.39.111.29. Facebook Group concurrency remains 160; the source concurrency file is byte-identical before and after deployment.

## Problem and change

`boundedProxyRead` previously deferred `PROXY_ENDPOINTS_UNAVAILABLE` only when `transport.proxyUsed === false`. Facebook can return this scheduling error after successful bootstrap or redirect requests, or on a reused session with no new requests, while `proxyUsed` is true. Some paths omit transport metadata entirely. These jobs incorrectly became terminal failures.

The exact top-level reason `PROXY_ENDPOINTS_UNAVAILABLE` now invokes the existing rotate/checkpoint/wait path independently of that transport flag. The worker retains the same Bull ticket, native cursor, seen IDs, pending items/page, source round, cutoff and retry budget, then delays using the existing bounded wait handler. The wait does not consume another read retry or produce a success/skip/failure outcome. Other native, security, auth and transport failure policies are unchanged. No retry of historical failed tickets was performed.

Only `src/services/crawlerQueueFlow.js` was installed. The old SHA-256 was `671b9e6b29775421051c679dfb02a94e90ad4a91e0c00d226a3b87dc89bd03bb`; the new hash is `8e949cc03ca35d9476d285e2b1504f4646ed19120852873d49a806e04267faa2`.

## Validation

- Local Node20 broad suite: 296 passed, zero failed, one zstd capability skip; focused proxy suite: 19/19 passed.
- Four new regression cases fail against the old branch and pass with the change: exhaustion after bootstrap, before a reused-session request, without transport metadata, and Facebook reader → actual Redis/Bull delayed ticket → same-cursor resume.
- Additional negative cases preserve security/native/configuration failure policy. Existing integration tests verify pending data preservation and no failed Bull attempts; the new live-Redis case verifies the actual delayed state and the same ticket/native cursor on resume.
- Node24.22.1 staging uses the current crawler runtime and the actual separate API runtime for proxy-manager tests. Focused checkpoint/retry/shutdown/round/recovery suite: 57/57 passed. Broad suite: 296/297 passed, zero skipped. The sole failure is the pre-existing getter-only Mongo error classification test in `crawlerErrorDetails.js`; baseline produces the same failure plus the four new regression failures. That unrelated module was not deployed.

## Deployment and preservation

Operation/backup: `/var/lib/crawler-v8/endpoint-exhaustion-delay-20261104-a/`.

Gracefully drained the coordinator and seven reader roles. Preserved owner/mode, backed up the old file, installed atomically with before/after hash guards, and checked syntax. Imports, API, proxy manager and queue board kept the same PIDs. Existing performance-watch maintenance state was restored after installation.

While readers were drained, the before/after Mongo cohort had 9,514 pending read tickets including 4,725 saved checkpoints and the identical SHA-256 `b524f9940bf6aef5962fa477308616d27b558fc9a03107207dea0d7cc9fab9c6`. Sixty-four checkpointed Mongo/Bull payload samples also had identical before/after hashes. All restarted services were active with NRestarts=0 immediately after deployment.

Source-concurrency SHA-256 stayed `4ac7970b4b701ec37660e0d7c94fadeeb46d0be7af771989959c49cf48cad5ff`; Group stayed at 160. Rollback code, original file metadata, staged test logs and preservation snapshots remain in the operation directory.

## Live verification

Read-only verification through 09:50:51 ICT observed 60 natural Group proxy-assignment wait events and 50 distinct checkpointed Group tickets in the actual Redis delayed set, with matching Mongo/Bull checkpoint payloads. A subsequent Redis check found all 50 back in waiting, with unchanged checkpoint hashes, page, round and retry budget. None had yet advanced a source page in the initial observation window; real-reader/same-cursor execution after delay is covered by the Redis integration test.

Since deployment in that window: 46 successful Group outcomes, zero Group terminal failures, zero terminal `PROXY_ENDPOINTS_UNAVAILABLE` events across flow queues, and zero runtime errors. One Facebook User job failed independently with `FACEBOOK_GRAPHQL_ERROR`. All inspected core services remained active/NRestarts=0 and Group concurrency remained 160.

Evidence is in `outputs/endpoint-exhaustion-delay-2026-11-04/verification.json`, `requeue-verification.log`, `live-verification.log`, and the `runtime-evidence/` directory. These short observations verify scheduling and checkpoint preservation, not a sustained throughput improvement.
