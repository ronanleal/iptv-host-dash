const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'production',
  DB_PATH: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '../../data/iptv_hosts.sqlite'),
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '*/10 * * * *',
  XTREAM_USERNAME: process.env.XTREAM_USERNAME || '727413',
  XTREAM_PASSWORD: process.env.XTREAM_PASSWORD || 'aqExxj',
  PROBE_CONCURRENCY: parseInt(process.env.PROBE_CONCURRENCY || '5', 10),
  PROBE_TIMEOUT_MS: parseInt(process.env.PROBE_TIMEOUT_MS || '4000', 10),
  DATA_RETENTION_DAYS: parseInt(process.env.DATA_RETENTION_DAYS || '14', 10),
  SOCKS_PROXY_URL: process.env.SOCKS_PROXY_URL || ''
};

module.exports = env;
