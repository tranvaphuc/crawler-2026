const fs = require('node:fs');
const path = require('node:path');

const cwd = __dirname;
const logDir = path.join(cwd, 'logs/es5-to-es9');
fs.mkdirSync(logDir, { recursive: true });
const stateDir = path.join(
  cwd,
  'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es9/oct-2026-migration',
);

module.exports = {
  apps: [
    {
      name: 'migration-es5-to-es9-oct-2026',
      cwd,
      script: 'scripts/run_es5_to_es9_migration.cjs',
      args: [stateDir],
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      merge_logs: true,
      out_file: path.join(logDir, 'migration.out.log'),
      error_file: path.join(logDir, 'migration.error.log'),
      time: true,
      autorestart: true,
      stop_exit_codes: [0],
      restart_delay: 30_000,
      min_uptime: '30s',
      max_restarts: 50,
      max_memory_restart: '4G',
      kill_timeout: 300_000,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Ho_Chi_Minh',
        ES5_REQUEST_TIMEOUT_MS: '120000',
        ES5_MAX_RETRIES: '2',
        ES5_SOURCE_INDEX_BATCH_SIZE: '32',
        ES5_TO_ES9_BACKFILL_LAG_HOURS: '24',
        ES9_MAX_SHARDS_PER_NODE: '3000',
      },
    },
    {
      name: 'sync-es5-to-es9-recent',
      cwd,
      script: 'scripts/run_es5_to_es9_recent_sync.cjs',
      args: [stateDir],
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
      merge_logs: true,
      out_file: path.join(logDir, 'recent-sync.out.log'),
      error_file: path.join(logDir, 'recent-sync.error.log'),
      time: true,
      autorestart: true,
      restart_delay: 30_000,
      max_memory_restart: '4G',
      kill_timeout: 300_000,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Ho_Chi_Minh',
        ES5_REQUEST_TIMEOUT_MS: '120000',
        ES5_MAX_RETRIES: '2',
        ES5_SOURCE_INDEX_BATCH_SIZE: '32',
        ES5_TO_ES9_RECENT_LOOKBACK_HOURS: '24',
        ES5_TO_ES9_RECENT_INTERVAL_MS: '300000',
        ES9_MAX_SHARDS_PER_NODE: '3000',
      },
    },
  ],
};
