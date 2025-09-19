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
} as const;
