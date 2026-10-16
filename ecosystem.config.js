module.exports = {
  apps: [
    {
      name: 'iptv-host-dash',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0',
        DB_PATH: './data/iptv_hosts.sqlite',
        CRON_SCHEDULE: '*/10 * * * *',
        XTREAM_USERNAME: '727413',
        XTREAM_PASSWORD: 'aqExxj',
        PROBE_CONCURRENCY: 5,
        PROBE_TIMEOUT_MS: 4000,
        DATA_RETENTION_DAYS: 14
      }
    }
  ]
};
