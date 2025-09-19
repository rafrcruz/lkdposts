import { z } from 'zod';
import { ENV } from '@/config/env';
import { ApiError } from './errors';
import { RateLimiter } from './rate-limiter';
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
const DEFAULT_TIMEOUT_MS = 10000;
export class ApiClient {
    constructor(config) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "rateLimiter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "retry", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeoutMs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "defaultHeaders", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "cache", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.defaultHeaders = config.defaultHeaders ?? {};
        this.rateLimiter = new RateLimiter(config.rateLimit ?? {
            maxRequests: ENV.RATE_LIMIT_MAX,
            perMilliseconds: ENV.RATE_LIMIT_WINDOW_MS,
        });
        this.retry = config.retry ?? {
            attempts: ENV.RETRY_ATTEMPTS,
            baseDelayMs: ENV.RETRY_BASE_DELAY_MS,
        };
    }
    get(path, options) {
        return this.request({ ...options, method: 'GET', path });
    }
    buildUrl(path, query) {
        const url = new URL(path, this.config.baseUrl);
        if (query) {
            Object.entries(query).forEach(([key, value]) => {
                if (value === undefined || value === null) {
                    return;
                }
                url.searchParams.set(key, String(value));
            });
        }
        return url;
    }
    async executeWithRetry(fn) {
        let attempt = 0;
        let lastError = undefined;
        while (attempt <= this.retry.attempts) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                const shouldRetry = error instanceof ApiError &&
                    (error.status === 429 || (error.status >= 500 && error.status < 600));
                if (!shouldRetry || attempt === this.retry.attempts) {
                    throw error;
                }
                const backoff = error instanceof ApiError && error.retryAfter ? error.retryAfter * 1000 : 0;
                const delay = backoff || this.retry.baseDelayMs * 2 ** attempt;
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt += 1;
            }
        }
        throw lastError;
    }
    getCacheKey(url, method, body) {
        if (method !== 'GET') {
            return null;
        }
        const serializedBody = body ? JSON.stringify(body) : '';
        return `${method}:${url.toString()}:${serializedBody}`;
    }
    readFromCache(key) {
        if (!key)
            return null;
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return cached.value;
    }
    writeToCache(key, value, ttl) {
        if (!key || !ttl)
            return;
        this.cache.set(key, { value, expiresAt: Date.now() + ttl });
    }
    async request({ path, method = 'GET', query, body, headers, schema, cache }) {
        const url = this.buildUrl(path, query);
        const cacheKey = this.getCacheKey(url, method, body);
        const cachedValue = this.readFromCache(cacheKey);
        if (cachedValue) {
            return cachedValue;
        }
        const doFetch = async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const requestHeaders = {
                    Accept: 'application/json',
                    ...this.defaultHeaders,
                    ...headers,
                };
                if (body !== undefined && body !== null) {
                    requestHeaders['Content-Type'] = 'application/json';
                }
                const response = await fetch(url, {
                    method,
                    headers: requestHeaders,
                    signal: controller.signal,
                    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
                    credentials: 'include',
                });
                return await this.handleResponse(response, schema);
            }
            catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    throw new ApiError({ status: 408, message: 'Request timed out' });
                }
                throw error;
            }
            finally {
                clearTimeout(timeout);
            }
        };
        const result = await this.rateLimiter.schedule(() => this.executeWithRetry(doFetch));
        this.writeToCache(cacheKey, result, cache?.ttl);
        return result;
    }
    async handleResponse(response, schema) {
        const contentType = response.headers.get('content-type') ?? '';
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await response.json() : await response.text();
        if (!response.ok) {
            const apiError = this.normalizeError(response, payload);
            throw apiError;
        }
        if (isJson) {
            const envelopeParse = envelopeSchema.safeParse(payload);
            if (envelopeParse.success) {
                const envelope = envelopeParse.data;
                if (!envelope.success) {
                    throw new ApiError({
                        status: response.status,
                        code: envelope.error?.code,
                        message: envelope.error?.message ?? 'API error',
                        details: envelope.error?.details,
                    });
                }
                const data = envelope.data;
                if (schema) {
                    return schema.parse(data);
                }
                return data;
            }
            if (schema) {
                return schema.parse(payload);
            }
            return payload;
        }
        return payload;
    }
    normalizeError(response, payload) {
        let message = response.statusText || 'API error';
        let code;
        let details;
        if (typeof payload === 'string' && payload.length) {
            message = payload;
        }
        if (typeof payload === 'object' && payload !== null) {
            const envelope = envelopeSchema.safeParse(payload);
            if (envelope.success && !envelope.data.success) {
                code = envelope.data.error?.code;
                message = envelope.data.error?.message ?? message;
                details = envelope.data.error?.details;
            }
            else {
                const candidate = payload.message;
                if (typeof candidate === 'string' || typeof candidate === 'number') {
                    message = String(candidate);
                }
                else if (candidate !== undefined && candidate !== null) {
                    details = details ?? candidate;
                }
            }
        }
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
        const errorOptions = {
            status: response.status,
            code,
            message,
            details,
            retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
        };
        return new ApiError(errorOptions);
    }
}
export const apiClient = new ApiClient({
    baseUrl: ENV.API_URL,
    rateLimit: {
        maxRequests: ENV.RATE_LIMIT_MAX,
        perMilliseconds: ENV.RATE_LIMIT_WINDOW_MS,
    },
    retry: {
        attempts: ENV.RETRY_ATTEMPTS,
        baseDelayMs: ENV.RETRY_BASE_DELAY_MS,
    },
});
