const env = require('./env');

const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  server: {
    host: env.HOST,
    port: env.PORT,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  cors: {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS,
  },
  security: {
    payloadLimit: env.PAYLOAD_LIMIT,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    },
  },
  database: {
    url: env.DATABASE_URL,
  },
  cache: {
    maxAgeSeconds: env.CACHE_MAX_AGE_SECONDS,
  },
  observability: {
    metricsEnabled: env.ENABLE_METRICS,
    swaggerEnabled: env.SWAGGER_UI_ENABLED,
  },
};

module.exports = config;
