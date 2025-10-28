const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const tracerouteMaxHops = toPositiveInt(process.env.TRACEROUTE_MAX_HOPS, 30);
const tracerouteTimeoutMs = toPositiveInt(process.env.TRACEROUTE_TIMEOUT_MS, 10000);

const config = {
  server: {
    host: '127.0.0.1',
    port: toPositiveInt(process.env.PORT, 3000),
  },
  traceroute: {
    defaultTarget: process.env.TRACEROUTE_DEFAULT_TARGET || '8.8.8.8',
    maxHops: tracerouteMaxHops,
    timeoutMs: tracerouteTimeoutMs,
    command: process.env.TRACEROUTE_COMMAND || null,
  },
};

module.exports = config;
