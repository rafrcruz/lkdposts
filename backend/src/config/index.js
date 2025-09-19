const env = require('./env');

const SESSION_COOKIE_NAME = 'lkd_session';

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
  auth: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    },
    session: {
      secret: env.SESSION_SECRET,
      ttlSeconds: env.SESSION_TTL_SECONDS,
      renewThresholdSeconds: env.SESSION_RENEW_THRESHOLD_SECONDS,
      cookieName: SESSION_COOKIE_NAME,
    },
    superAdminEmail: env.SUPERADMIN_EMAIL.toLowerCase(),
  },
  sentry: {
    dsn: env.SENTRY_DSN_BACKEND || null,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
  },
};

module.exports = config;
