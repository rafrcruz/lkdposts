import { ENV } from '@/config/env';
import { z, type ZodSchema } from 'zod';

export class HttpError extends Error {
  status: number;
  payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions<TBody> {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
}

interface JsonRequestOptions<TBody, TResponse> extends RequestOptions<TBody> {
  schema?: ZodSchema<TResponse>;
}

async function requestJson<TResponse, TBody = unknown>(path: string, options: JsonRequestOptions<TBody, TResponse> = {}) {
  const { method = 'GET', body, schema, headers = {} } = options;
  const url = buildUrl(path, ENV.API_URL);

  const requestInit: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers = {
      'Content-Type': 'application/json',
      ...requestInit.headers,
    } as HeadersInit;
  }

  const response = await fetch(url, requestInit);
  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload: unknown = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    let message = response.statusText || 'Request failed';

    if (isJson && typeof payload === 'object' && payload !== null) {
      const envelope = envelopeSchema.safeParse(payload);
      if (envelope.success && !envelope.data.success) {
        message = envelope.data.error?.message ?? message;
      } else if ('message' in (payload as Record<string, unknown>)) {
        message = String((payload as Record<string, unknown>).message);
      }
    }

    throw new HttpError(message, response.status, payload);
  }

  if (!isJson) {
    return payload as TResponse;
  }

  const envelope = envelopeSchema.safeParse(payload);

  if (envelope.success) {
    if (!envelope.data.success) {
      throw new HttpError(envelope.data.error?.message ?? 'Request failed', response.status, envelope.data.error);
    }

    const data = envelope.data.data as TResponse;
    return schema ? schema.parse(data) : data;
  }

  return schema ? schema.parse(payload) : (payload as TResponse);
}

export function getJson<TResponse>(path: string, schema?: ZodSchema<TResponse>) {
  return requestJson<TResponse>(path, { method: 'GET', schema });
}

export function postJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodSchema<TResponse>) {
  return requestJson<TResponse, TBody>(path, { method: 'POST', body, schema });
}

export function patchJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodSchema<TResponse>) {
  return requestJson<TResponse, TBody>(path, { method: 'PATCH', body, schema });
}

export function deleteJson<TResponse>(path: string, schema?: ZodSchema<TResponse>) {
  return requestJson<TResponse, undefined>(path, { method: 'DELETE', schema });
}

export function putJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodSchema<TResponse>) {
  return requestJson<TResponse, TBody>(path, { method: 'PUT', body, schema });
}
