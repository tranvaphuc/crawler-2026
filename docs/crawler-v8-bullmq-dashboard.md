# Crawler queue dashboard

The separate queue flow in [crawler-queue-flow.md](crawler-queue-flow.md) replaces the former single `crawler-v8-production` queue and both v8 worker shards. Run `crawler-queue-flow.service`; keep `crawler-v8`, `crawler-v8-shard1` and `crawler-v8-watchdog.timer` disabled.

`crawler-v8-queue-board.service` continues serving the dashboard on `127.0.0.1:3806`, routed through `https://queue.oneforsl.net/bull`. Existing HTTP Basic credentials in `/etc/crawler-v8/queue-board.env` remain valid. All twelve queues have full Bull Board actions enabled, including retry, edit, delete, pause and resume. Completed jobs disappear immediately; failed import/validation jobs remain until the operator acts on them.

`GET /api/summary` requires the same credentials and returns queue names, configured worker counts, Bull states and Mongo outbox states.

```sh
systemctl is-active crawler-queue-flow crawler-v8-queue-board redis-server caddy
sudo -u crawler-v8 /opt/crawler-node/bin/node --env-file=/etc/crawler-v8/runtime.env /opt/crawler-v8/current/scripts/verify_crawler_queue_flow.mjs
```

Full database backup before reset is stored privately under `/var/lib/crawler-v8/flow-reset-backup-*`. Its manifest records collection counts, indexes, options, SHA-256 and verification time. The active runtime reset clears its specified job, checkpoint, document staging and scheduling collections, while retaining source identity metadata, archived audit evidence and existing ES5 data.
