# PM2 migration processes

Configuration: `ecosystem.migrations.config.cjs`

## Processes

| PM2 name | Mode | Schedule |
|---|---|---|
| `migration-es7-to-es8-full` | One-time, resumable | Starts when the PM2 config is started |
| `migration-es7-to-es8-recent` | Scheduled | Minute 5 of every hour |
| `migration-es5-to-es8-aug-full` | One-time, resumable | Starts when the PM2 config is started |
| `migration-es5-to-es8-recent-6h` | Scheduled | 00:10, 06:10, 12:10, 18:10 Asia/Ho_Chi_Minh |

The scheduled processes run once and stop successfully. PM2 keeps their cron registration and starts them again at the next scheduled time.

## Start

The current ES7 full migration is managed by launchd as `com.kompa.es7-to-es8.full`. Do not start the PM2 copy concurrently. Either wait for launchd to finish, or intentionally hand it over at a completed daily checkpoint.

```bash
npx pm2 start ecosystem.migrations.config.cjs
npx pm2 save
```

To register only selected processes:

```bash
npx pm2 start ecosystem.migrations.config.cjs --only migration-es7-to-es8-recent,migration-es5-to-es8-aug-full,migration-es5-to-es8-recent-6h
```

## Inspect

```bash
npx pm2 status
npx pm2 logs migration-es7-to-es8-full
npx pm2 logs migration-es5-to-es8-aug-full
```

## Important behavior

- Full jobs restart after a non-zero exit and stop permanently after exit code 0.
- ES7 recent sync skips while the ES7 full migration lock is active.
- ES5 full and recent jobs use the same lock, so they cannot write concurrently.
- ES5 recent sync only queries documents with `insertedDate` in the last six hours.
- The existing Codex automations must be paused before PM2 becomes the scheduler, otherwise both schedulers can trigger the same recent jobs.
