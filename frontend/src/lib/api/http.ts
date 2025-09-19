import { ENV } from '@/config/env';
import { z, type ZodSchema } from 'zod';

const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.unknown().optional(),
    })
    .optional(),
});

const buildUrl = (path: string, baseUrl: string) => {
  try {
    return new URL(path, baseUrl);
  } catch (error) {
    throw new Error(`Failed to construct URL for ${path}: ${(error as Error).message}`);
  }
};

export async function getJson<T>(path: string, schema?: ZodSchema<T>): Promise<T> {
  const url = buildUrl(path, ENV.API_URL);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload: unknown = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = isJson && typeof payload === 'object' && payload !== null && 'message' in payload
      ? String((payload as Record<string, unknown>).message)
      : response.statusText || 'Request failed';
    throw new Error(message);
  }

  if (!isJson) {
    if (schema) {
      throw new Error('Expected JSON response but received another content type');
    }
    return payload as T;
  }

  const envelope = envelopeSchema.safeParse(payload);

  if (envelope.success) {
    if (!envelope.data.success) {
      throw new Error(envelope.data.error?.message ?? 'Request failed');
    }

    const data = envelope.data.data as T;
    return schema ? schema.parse(data) : data;
  }

  return schema ? schema.parse(payload) : (payload as T);
}

