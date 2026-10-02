# ES5 to Elasticsearch 9 migration

The job copies ES5 documents whose `insertedDate` is between 2026-10-01 00:00 Asia/Ho_Chi_Minh and the first successful job start. It writes canonical documents to daily `masterYYYYMMDD` indices selected from `publishedDate`.

The full job is idempotent: target IDs are deterministic, writes use upsert, each completed UTC window is checkpointed, and PM2 retries only failed runs. A successful full run exits with code 0 and remains stopped.

The incremental job starts only after the full job is complete. It runs every six hours, resumes from its last successful cursor, and rereads the preceding two hours to catch late writes. Both jobs use the same lock, so they never write concurrently.

## Required `.env`

```dotenv
ES5_HOST=http://source-es5:9200
ES9_HOST=51.79.20.199
ES9_PORT=57095
ES9_USER=elastic
ES9_PASS=...
ES9_PROTOCOL=https

# Optional tuning
ES5_TO_ES9_START=2026-09-30T17:00:00.000Z
ES5_TO_ES9_SLICES=4
ES5_TO_ES9_RECENT_OVERLAP_HOURS=2
ES5_TO_ES9_RECENT_SLICES=4
ES9_MASTER_SHARDS=1
ES9_MASTER_REPLICAS=0
ES9_MASTER_REFRESH_INTERVAL=30s
```

## Validate before starting

```bash
npm ci
node scripts/migrate_es5_oct2026_to_es9.mjs --plan
```

`--plan` deploys and simulates the ES9 template, then reports the ES5 document count without writing documents.

## Start with PM2

```bash
npx pm2 start ecosystem.es5-to-es9.config.cjs
npx pm2 save
npx pm2 status
npx pm2 logs migration-es5-to-es9-oct-2026 sync-es5-to-es9-recent
```

State and checkpoints are stored at:

```text
outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es9/oct-2026-migration/full-state.json
outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es9/oct-2026-migration/recent-sync/cursor.json
```

To retry a failed job after fixing its cause:

```bash
npx pm2 restart migration-es5-to-es9-oct-2026
```

To trigger an incremental run immediately:

```bash
npx pm2 restart sync-es5-to-es9-recent
```
