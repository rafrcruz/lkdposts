import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .pipe(z.string().url().or(z.literal('')))
    .transform((value) => (value === '' ? 'http://localhost:3001' : value)),
  VITE_DEFAULT_LOCALE: z
    .string()
    .optional()
    .transform((value) => value?.trim() || 'pt-BR'),
  VITE_FALLBACK_LOCALE: z
    .string()
    .optional()
    .transform((value) => value?.trim() || 'en'),
  VITE_GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .pipe(z.string().min(1, 'VITE_GOOGLE_CLIENT_ID is required')),
  VITE_SENTRY_DSN_FRONTEND: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ''),
  VITE_SENTRY_TRACES_SAMPLE_RATE: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => {
      if (!value) {
        return 0;
      }
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .pipe(z.number().min(0).max(1)),
  VITE_SENTRY_PROFILES_SAMPLE_RATE: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => {
      if (!value) {
        return 0;
      }
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .pipe(z.number().min(0).max(1)),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error('Failed to parse Vite environment variables', parsed.error.flatten());
  throw new Error('Invalid Vite environment configuration');
}

export const ENV = {
  API_URL: parsed.data.VITE_API_URL,
  DEFAULT_LOCALE: parsed.data.VITE_DEFAULT_LOCALE,
  FALLBACK_LOCALE: parsed.data.VITE_FALLBACK_LOCALE,
  GOOGLE_CLIENT_ID: parsed.data.VITE_GOOGLE_CLIENT_ID,
  SENTRY_DSN: parsed.data.VITE_SENTRY_DSN_FRONTEND,
  SENTRY_TRACES_SAMPLE_RATE: parsed.data.VITE_SENTRY_TRACES_SAMPLE_RATE,
  SENTRY_PROFILES_SAMPLE_RATE: parsed.data.VITE_SENTRY_PROFILES_SAMPLE_RATE,
} as const;
