# Anonymous Facebook group collection

Run from the repository root with Node 20+:

```sh
node scripts/collect_group_posts_bulk.mjs \
  --input outputs/facebook-groups-1000-2026-10-21/group-ids.json \
  --har /Users/phuctran/Downloads/www.facebook.com.har \
  --out outputs/facebook-groups-september-2026-10-21 \
  --month 2026-09 --target 1000 --delay 2000 \
  --proxy-key-file outputs/facebook-groups-september-2026-10-21/proxyvn-key.txt
```

The key file is in the ignored `outputs/` directory with owner-only permissions.
Only existing proxy service endpoints are used; no purchase or renewal calls.

Each group is paginated in chronological order. October posts are skipped. September
posts are saved up to 1,000 per group. Encountering the first post before September
stops that group immediately. Boundaries use `Asia/Ho_Chi_Minh` (UTC+7). Rows contain
`id, siteId, siteName, __typename, link, time`; the type comes exclusively from
`feedback.owning_profile.__typename`, with an empty string when absent. Time in JSONL
is Unix seconds; the workbook displays local Vietnam time.

Cookies and account authentication are excluded from the HAR request template.
Rate limits, access-denied responses and proxy/transport failures retain the cursor,
discard the proxy agent and acquire another proxy. Provider cooldowns and Facebook
Retry-After are honoured. Three consecutive failures trigger a five-minute cooldown.
Authentication/security checks and invalid request templates stop collection.

`state.json` is atomically updated after each request, including progress, proxy
rotation counts, the active group, latest error and retry time. `posts.jsonl` is
append-only and deduplicated per group on resume. `collector.lock` prevents duplicate
processes for the same output directory. `run.log` contains no API keys or proxy
authentication. Provider API failures have separate error codes from Facebook errors.

To export the current checkpoint using the bundled spreadsheet runtime:

```sh
/Users/phuctran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  outputs/facebook-groups-september-2026-10-21/build-workbook.mjs
```

The five-minute chat heartbeat reads the checkpoint and log; it does not start a
second collector. Keep the computer and Codex running for collection and reports.
