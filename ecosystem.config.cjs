module.exports = {
  apps: [
    {
      name: 'bull-board',
      script: 'src/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
    },
    {
      name: 'facebook-worker',
      script: 'src/queues/facebook/worker.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
    },
  ],
};
