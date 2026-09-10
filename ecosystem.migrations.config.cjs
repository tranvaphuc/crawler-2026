const path = require('node:path');

const cwd = __dirname;
const logDir = path.join(
  cwd,
  'outputs/01a07164-8064-7313-962f-0d73887aa809/pm2-migrations',
);
const masterMigrationDir = path.join(
  cwd,
  'outputs/01a07164-8064-7313-962f-0d73887aa809/master-migration',
);
const es5MigrationDir = path.join(
  cwd,
  'outputs/01a07164-8064-7313-962f-0d73887aa809/es5-to-es8/migration',
);

const common = {
  cwd,
  interpreter: 'node',
  exec_mode: 'fork',
  instances: 1,
  watch: false,
  merge_logs: true,
  time: true,
  kill_timeout: 300_000,
  env: {
    NODE_ENV: 'production',
    TZ: 'Asia/Ho_Chi_Minh',
  },
};

const oneTime = {
  ...common,
  autorestart: true,
  stop_exit_codes: [0],
  restart_delay: 15_000,
  min_uptime: '30s',
  max_restarts: 20,
  max_memory_restart: '4G',
};

const scheduled = {
  ...common,
  // A successful one-shot sync stays stopped until PM2's next cron restart.
  autorestart: false,
  stop_exit_codes: [0],
  max_memory_restart: '4G',
};

module.exports = {
  apps: [
    {
      ...oneTime,
      name: 'migration-es7-to-es8-full',
      script: 'scripts/migrate_es7_to_es8_full.mjs',
      args: [
        'topic56fc9bc282ea19d067e5d8a1',
        path.join(masterMigrationDir, 'full'),
      ],
      out_file: path.join(logDir, 'es7-full.out.log'),
      error_file: path.join(logDir, 'es7-full.error.log'),
    },
    {
      ...scheduled,
      name: 'migration-es7-to-es8-recent',
      script: 'scripts/sync_es7_recent_inserted.mjs',
      args: [
        'topic56fc9bc282ea19d067e5d8a1',
        path.join(masterMigrationDir, 'recent-sync'),
      ],
      // At minute 5 every hour. The script itself queries insertedDate now-2d..now.
      cron_restart: '5 * * * *',
      out_file: path.join(logDir, 'es7-recent.out.log'),
      error_file: path.join(logDir, 'es7-recent.error.log'),
    },
    {
      ...oneTime,
      name: 'migration-es5-to-es8-aug-full',
      script: 'scripts/migrate_es5_aug2026_to_es8.mjs',
      args: [es5MigrationDir],
      out_file: path.join(logDir, 'es5-aug-full.out.log'),
      error_file: path.join(logDir, 'es5-aug-full.error.log'),
    },
    {
      ...scheduled,
      name: 'migration-es5-to-es8-recent-6h',
      script: 'scripts/sync_es5_recent_6h.mjs',
      args: [es5MigrationDir],
      // 00:10, 06:10, 12:10 and 18:10 in the host timezone.
      cron_restart: '10 */6 * * *',
      out_file: path.join(logDir, 'es5-recent-6h.out.log'),
      error_file: path.join(logDir, 'es5-recent-6h.error.log'),
    },
  ],
};
