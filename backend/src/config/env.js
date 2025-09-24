const fs = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const { z } = require('zod');

const envFromCli = process.env.NODE_ENV;
const envName = envFromCli && envFromCli.trim() !== '' ? envFromCli : 'development';

const envFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), `.env.${envName}`),
];

for (const filePath of envFiles) {
  if (fs.existsSync(filePath)) {
    loadEnv({ path: filePath, override: true });
  }
}

const toBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return defaultValue;
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
};

const toNumber = (value, defaultValue) => {
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const toFloat = (value, defaultValue) => {
  if (value === undefined || value === '') return defaultValue;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
};

const toList = (value, defaultValue = []) => {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.preprocess((value) => toNumber(value, 3001), z.number().int().positive()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ALLOWED_ORIGINS: z.preprocess(
    (value) => toList(value, ['http://localhost:5173']),
    z.array(z.string().url()).nonempty()
  ),
  PAYLOAD_LIMIT: z.string().min(1).default('100kb'),
  RATE_LIMIT_WINDOW_MS: z.preprocess((value) => toNumber(value, 60000), z.number().int().positive()),
  RATE_LIMIT_MAX: z.preprocess((value) => toNumber(value, 100), z.number().int().positive()),
  ENABLE_METRICS: z.preprocess((value) => toBoolean(value, true), z.boolean()),
  CACHE_MAX_AGE_SECONDS: z.preprocess((value) => toNumber(value, 60), z.number().int().nonnegative()),
  CACHE_FEED_FETCH_TTL_SECONDS: z.preprocess((value) => toNumber(value, 120), z.number().int().nonnegative()),
  CACHE_FEED_FETCH_MAX_ENTRIES: z.preprocess((value) => toNumber(value, 16), z.number().int().positive()),
  SWAGGER_UI_ENABLED: z.preprocess((value) => toBoolean(value, true), z.boolean()),
  DEBUG_AUTH: z.preprocess((value) => toBoolean(value, false), z.boolean()),
  DATABASE_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  SESSION_TTL_SECONDS: z.preprocess((value) => toNumber(value, 3600), z.number().int().positive()),
  SESSION_RENEW_THRESHOLD_SECONDS: z.preprocess((value) => toNumber(value, 900), z.number().int().nonnegative()),
  SUPERADMIN_EMAIL: z.string().email(),
  SENTRY_DSN_BACKEND: z.string().optional().transform((value) => (value ? value.trim() : '')),
  PRISMA_URL: z.string().url().optional().transform((value) => (value ? value.trim() : '')),
  SENTRY_TRACES_SAMPLE_RATE: z
    .preprocess((value) => toFloat(value, 0.05), z.number().min(0).max(1))
    .default(0),
  SENTRY_PROFILES_SAMPLE_RATE: z
    .preprocess((value) => toFloat(value, 0), z.number().min(0).max(1))
    .default(0),
  RSS_KEEP_EMBEDS: z.preprocess((value) => toBoolean(value, false), z.boolean()),
  RSS_ALLOWED_IFRAME_HOSTS: z.preprocess((value) => toList(value, []), z.array(z.string())),
  RSS_INJECT_TOP_IMAGE: z.preprocess((value) => toBoolean(value, true), z.boolean()),
  RSS_EXCERPT_MAX_CHARS: z.preprocess((value) => toNumber(value, 220), z.number().int().positive()),
  RSS_MAX_HTML_KB: z.preprocess((value) => toNumber(value, 150), z.number().int().positive()),
  RSS_STRIP_KNOWN_BOILERPLATES: z.preprocess((value) => toBoolean(value, true), z.boolean()),
  RSS_REPROCESS_POLICY: z
    .enum(['never', 'if-empty', 'if-empty-or-changed', 'always'])
    .default('if-empty-or-changed'),
  RSS_LOG_LEVEL: z
    .preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value ?? 'info'), z.string())
    .transform((value) => value || 'info'),
  RSS_TRACKER_PARAMS_REMOVE_LIST: z
    .preprocess((value) => {
      const list = toList(value, []);
      return list.length === 0 ? null : list;
    }, z.array(z.string()).nullable())
    .default(null),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Failed to validate environment variables:', parsedEnv.error.flatten());
  process.exit(1);
}

module.exports = parsedEnv.data;

