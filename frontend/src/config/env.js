import { z } from 'zod';
const env = import.meta.env;
const stringFrom = (value, fallback) => {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (Array.isArray(value)) {
        const concatenated = value
            .map((item) => stringFrom(item, undefined))
            .filter((item) => Boolean(item))
            .join(',');
        return concatenated === '' ? fallback : concatenated;
    }
    if (typeof value === 'string') {
        return value === '' ? fallback : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        const stringified = String(value);
        return stringified === '' ? fallback : stringified;
    }
    return fallback;
};
const numberFrom = (value, fallback) => {
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
};
const booleanFrom = (value, fallback) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
    }
    return fallback;
};
const arrayFromCsv = (value) => value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
const envSchema = z.object({
    VITE_API_URL: z
        .preprocess((value) => stringFrom(value, 'http://localhost:3001'), z.string().url()),
    VITE_FEATURE_FLAGS: z
        .preprocess((value) => stringFrom(value), z.string().optional())
        .transform(arrayFromCsv)
        .default([]),
    VITE_DEFAULT_LOCALE: z
        .preprocess((value) => stringFrom(value, 'pt-BR'), z.string().min(2)),
    VITE_FALLBACK_LOCALE: z
        .preprocess((value) => stringFrom(value, 'en'), z.string().min(2)),
    VITE_ENABLE_PWA: z
        .preprocess((value) => booleanFrom(value, false), z.boolean()),
    VITE_RATE_LIMIT_MAX: z
        .preprocess((value) => numberFrom(value, 5), z.number().int().positive()),
    VITE_RATE_LIMIT_WINDOW_MS: z
        .preprocess((value) => numberFrom(value, 1000), z.number().int().positive()),
    VITE_RETRY_ATTEMPTS: z
        .preprocess((value) => numberFrom(value, 3), z.number().int().nonnegative()),
    VITE_RETRY_BASE_DELAY_MS: z
        .preprocess((value) => numberFrom(value, 300), z.number().int().positive()),
});
const parsed = envSchema.safeParse(env);
if (!parsed.success) {
    console.error('Failed to parse environment variables', parsed.error.flatten());
    throw new Error('Invalid Vite environment configuration');
}
export const ENV = {
    API_URL: parsed.data.VITE_API_URL,
    FEATURE_FLAGS: parsed.data.VITE_FEATURE_FLAGS,
    DEFAULT_LOCALE: parsed.data.VITE_DEFAULT_LOCALE,
    FALLBACK_LOCALE: parsed.data.VITE_FALLBACK_LOCALE,
    ENABLE_PWA: parsed.data.VITE_ENABLE_PWA,
    RATE_LIMIT_MAX: parsed.data.VITE_RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS: parsed.data.VITE_RATE_LIMIT_WINDOW_MS,
    RETRY_ATTEMPTS: parsed.data.VITE_RETRY_ATTEMPTS,
    RETRY_BASE_DELAY_MS: parsed.data.VITE_RETRY_BASE_DELAY_MS,
};
