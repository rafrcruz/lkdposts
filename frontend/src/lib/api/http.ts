import { ENV } from '@/config/env';
import { z, type ZodType, type ZodTypeDef } from 'zod';

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

const DEFAULT_ERROR_MESSAGE = 'Request failed';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractErrorMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const envelope = envelopeSchema.safeParse(payload);
  if (envelope.success && !envelope.data.success) {
    return envelope.data.error?.message ?? fallback;
  }

  const { message } = payload as { message?: unknown };
  return typeof message === 'string' ? message : fallback;
};

const parseJsonPayload = <TResponse>(
  payload: unknown,
  schema: ZodType<TResponse, ZodTypeDef, unknown> | undefined,
  status: number,
) => {
  const envelope = envelopeSchema.safeParse(payload);

  if (envelope.success) {
    if (!envelope.data.success) {
      throw new HttpError(envelope.data.error?.message ?? DEFAULT_ERROR_MESSAGE, status, envelope.data.error);
    }

    const data = envelope.data.data as TResponse;
    return schema ? schema.parse(data) : data;
  }

  return schema ? schema.parse(payload) : (payload as TResponse);
};

const buildUrl = (path: string, baseUrl: string) => {
  try {
    return new URL(path, baseUrl);
  } catch (error) {
    throw new Error(`Failed to construct URL for ${path}: ${(error as Error).message}`);
  }
};

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions<TBody> = {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
};

type JsonRequestOptions<TBody, TResponse> = RequestOptions<TBody> & {
  schema?: ZodType<TResponse, ZodTypeDef, unknown>;
};

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
    const fallback = response.statusText || DEFAULT_ERROR_MESSAGE;
    const message = isJson ? extractErrorMessage(payload, fallback) : fallback;
    throw new HttpError(message, response.status, payload);
  }

  if (!isJson) {
    return payload as TResponse;
  }

  return parseJsonPayload<TResponse>(payload, schema, response.status);
}

export function getJson<TResponse>(path: string, schema?: ZodType<TResponse, ZodTypeDef, unknown>) {
  return requestJson<TResponse>(path, { method: 'GET', schema });
}

export function postJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodType<TResponse, ZodTypeDef, unknown>) {
  return requestJson<TResponse, TBody>(path, { method: 'POST', body, schema });
}

export function patchJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodType<TResponse, ZodTypeDef, unknown>) {
  return requestJson<TResponse, TBody>(path, { method: 'PATCH', body, schema });
}

export function deleteJson<TResponse>(path: string, schema?: ZodType<TResponse, ZodTypeDef, unknown>) {
  return requestJson<TResponse, undefined>(path, { method: 'DELETE', schema });
}

export function putJson<TResponse, TBody = unknown>(path: string, body: TBody, schema?: ZodType<TResponse, ZodTypeDef, unknown>) {
  return requestJson<TResponse, TBody>(path, { method: 'PUT', body, schema });
}

