const fs = require('fs');
const path = require('path');
const { config: loadEnv } = require('dotenv');
const { z } = require('zod');

const envFromCli = process.env.NODE_ENV;
const envName = envFromCli && envFromCli.trim() !== '' ? envFromCli : 'development';

const envFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), `.env.${envName}`),
];

envFiles.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    loadEnv({ path: filePath, override: true });
  }
});

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
  RATE_LIMIT_WINDOW_MS: z.preprocess((value) => toNumber(value, 60_000), z.number().int().positive()),
  RATE_LIMIT_MAX: z.preprocess((value) => toNumber(value, 100), z.number().int().positive()),
  ENABLE_METRICS: z.preprocess((value) => toBoolean(value, true), z.boolean()),
  CACHE_MAX_AGE_SECONDS: z.preprocess((value) => toNumber(value, 60), z.number().int().nonnegative()),
  SWAGGER_UI_ENABLED: z.preprocess((value) => toBoolean(value, true), z.boolean()),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Failed to validate environment variables:', parsedEnv.error.flatten());
  process.exit(1);
}

module.exports = parsedEnv.data;
