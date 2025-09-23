const env = require('./env');

const SESSION_COOKIE_NAME = 'lkd_session';
const release = process.env.VERCEL_GIT_COMMIT_SHA || env.NODE_ENV;
const vercelEnv = process.env.VERCEL_ENV ? process.env.VERCEL_ENV.toLowerCase() : null;
const isPreviewDeployment = vercelEnv === 'preview';
const isProductionDeployment = vercelEnv === 'production';

const config = {
  env: env.NODE_ENV,
  release,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  runtime: {
    vercelEnv,
    isPreviewDeployment,
    isProductionDeployment,
  },
  debug: {
    authInspector: env.DEBUG_AUTH,
  },
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
    pooledUrl: env.PRISMA_URL && env.PRISMA_URL.length > 0 ? env.PRISMA_URL : null,
  },
  cache: {
    maxAgeSeconds: env.CACHE_MAX_AGE_SECONDS,
    feedFetchTtlMs: env.CACHE_FEED_FETCH_TTL_SECONDS * 1000,
    feedFetchMaxEntries: env.CACHE_FEED_FETCH_MAX_ENTRIES,
  },
  observability: {
    metricsEnabled: env.ENABLE_METRICS,
    swaggerEnabled: env.SWAGGER_UI_ENABLED,
  },
  rss: {
    keepEmbeds: env.RSS_KEEP_EMBEDS,
    allowedIframeHosts: env.RSS_ALLOWED_IFRAME_HOSTS,
    injectTopImage: env.RSS_INJECT_TOP_IMAGE,
    excerptMaxChars: env.RSS_EXCERPT_MAX_CHARS,
    maxHtmlKB: env.RSS_MAX_HTML_KB,
    stripKnownBoilerplates: env.RSS_STRIP_KNOWN_BOILERPLATES,
    reprocessPolicy: env.RSS_REPROCESS_POLICY,
    logLevel: env.RSS_LOG_LEVEL || 'info',
    trackerParamsRemoveList: env.RSS_TRACKER_PARAMS_REMOVE_LIST,
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
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE,
  },
};

module.exports = config;
