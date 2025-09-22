import axios, { type AxiosResponse } from 'axios';
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

type UnauthorizedHandler = (error: HttpError) => void;

const unauthorizedHandlers = new Set<UnauthorizedHandler>();

const notifyUnauthorized = (error: HttpError) => {
  if (error.status !== 401) {
    return;
  }

  for (const handler of unauthorizedHandlers) {
    try {
      handler(error);
    } catch {
      // ignore listener failures so they do not affect the request flow
    }
  }
};

export const onUnauthorized = (handler: UnauthorizedHandler) => {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
};

const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  meta: z.unknown().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.unknown().optional(),
    })
    .optional(),
});

const DEFAULT_ERROR_MESSAGE = 'Request failed';

const createHttpError = (message: string, status: number, payload?: unknown) => {
  const error = new HttpError(message, status, payload);
  notifyUnauthorized(error);
  return error;
};

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
      throw createHttpError(envelope.data.error?.message ?? DEFAULT_ERROR_MESSAGE, status, envelope.data.error);
    }

    if (schema) {
      return schema.parse(envelope.data.data);
    }

    return envelope.data.data as TResponse;
  }

  if (schema) {
    return schema.parse(payload);
  }

  return payload as TResponse;
};

const buildUrl = (path: string, baseUrl: string) => {
  try {
    return new URL(path, baseUrl);
  } catch (error) {
    const message = (error as Error).message;
    throw new Error('Failed to construct URL for ' + path + ': ' + message);
  }
};

export const apiHttpClient = axios.create({
  baseURL: ENV.API_URL,
  withCredentials: true,
});

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions<TBody> = {
  method?: HttpMethod;
  body?: TBody;
  headers?: Record<string, string>;
};

type JsonRequestOptions<TBody, TResponse> = RequestOptions<TBody> & {
  schema?: ZodType<TResponse, ZodTypeDef, unknown>;
};

type JsonRequestWithMetaOptions<TBody, TResponse, TMeta> = JsonRequestOptions<TBody, TResponse> & {
  metaSchema?: ZodType<TMeta, ZodTypeDef, unknown>;
};

apiHttpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response) {
      const response: AxiosResponse<unknown> = error.response;
      const { status, statusText, data } = response;
      const fallback = statusText || DEFAULT_ERROR_MESSAGE;
      const message = extractErrorMessage(data, fallback);
      return Promise.reject(createHttpError(message, status, data));
    }

    const fallbackMessage = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
    const fallbackError = error instanceof Error ? error : new Error(fallbackMessage);

    return Promise.reject(fallbackError);
  },
);

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
    throw createHttpError(message, response.status, payload);
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

async function requestJsonWithMeta<TResponse, TBody = unknown, TMeta = Record<string, unknown>>(
  path: string,
  options: JsonRequestWithMetaOptions<TBody, TResponse, TMeta> = {},
) {
  const { method = 'GET', body, schema, headers = {}, metaSchema } = options;

  if (!schema) {
    throw new Error('requestJsonWithMeta requires a schema to parse the response payload');
  }

  if (!metaSchema) {
    throw new Error('requestJsonWithMeta requires a metaSchema to parse the response metadata');
  }
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
    throw createHttpError(message, response.status, payload);
  }

  if (!isJson) {
    throw new Error('Expected JSON response with metadata payload');
  }

  const envelope = envelopeSchema.safeParse(payload);

  if (!envelope.success) {
    throw new Error('Invalid response envelope for metadata request');
  }

  if (!envelope.data.success) {
    throw createHttpError(envelope.data.error?.message ?? DEFAULT_ERROR_MESSAGE, response.status, envelope.data.error);
  }

  return {
    data: schema.parse(envelope.data.data),
    meta: metaSchema.parse(envelope.data.meta),
  };
}

export function getJsonWithMeta<TResponse, TMeta = Record<string, unknown>>(
  path: string,
  schema?: ZodType<TResponse, ZodTypeDef, unknown>,
  metaSchema?: ZodType<TMeta, ZodTypeDef, unknown>,
) {
  return requestJsonWithMeta<TResponse, undefined, TMeta>(path, { method: 'GET', schema, metaSchema });
}
