const config = require('../config');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30000;

let cachedClient = null;

const fetchWithTimeout = async (url, options, timeoutMs, apiKey) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const extraHeaders = options?.headers;
    const headers =
      extraHeaders && typeof extraHeaders === 'object'
        ? {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...extraHeaders,
          }
        : {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          };

    return await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const parseErrorPayload = async (response) => {
  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  } catch (parseError) {
    console.warn('Failed to parse OpenAI error response payload', parseError);
    return null;
  }
};

const normalizeOpenAiError = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate =
    Object.hasOwn(payload, 'error') && typeof payload.error === 'object'
      ? payload.error
      : payload;

  return {
    type: typeof candidate.type === 'string' ? candidate.type : null,
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message: typeof candidate.message === 'string' ? candidate.message : null,
  };
};

const raiseResponseError = async (response) => {
  const parsedPayload = await parseErrorPayload(response);
  const error = new Error(`OpenAI request failed with status ${response.status}`);
  error.status = response.status;
  error.response = response;

  const openAiError = normalizeOpenAiError(parsedPayload);
  if (openAiError) {
    error.openai = openAiError;
  }

  if (parsedPayload && typeof parsedPayload !== 'string') {
    error.payload = parsedPayload;
  }

  throw error;
};

const normalizeTimeout = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return DEFAULT_TIMEOUT_MS;
};

const getOpenAIEnvironment = ({ timeoutMs } = {}) => {
  const baseUrlRaw = config.openai?.baseUrl ?? process.env.OPENAI_BASE_URL ?? '';
  const baseUrl = baseUrlRaw.trim().replace(/\/?$/, '') || DEFAULT_BASE_URL;
  const configuredTimeout = timeoutMs ?? config.openai?.timeoutMs;
  const effectiveTimeout = normalizeTimeout(configuredTimeout);

  return {
    baseUrl,
    timeoutMs: effectiveTimeout,
  };
};

const createClient = ({ timeoutMs }) => {
  const apiKey = config.openai?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const { baseUrl, timeoutMs: effectiveTimeout } = getOpenAIEnvironment({ timeoutMs });

  const responses = {
    create: async (payload) => {
      try {
        const response = await fetchWithTimeout(
          `${baseUrl}/responses`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          effectiveTimeout,
          apiKey,
        );

        if (!response.ok) {
          await raiseResponseError(response);
        }

        return response.json();
      } catch (error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error('OpenAI request timed out');
          timeoutError.status = 408;
          throw timeoutError;
        }
        throw error;
      }
    },
  };

  const withOptions = ({ timeout }) => createClient({ timeoutMs: Number(timeout) || effectiveTimeout });

  return {
    responses,
    withOptions,
  };
};

const getOpenAIClient = () => {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createClient({ timeoutMs: config.openai?.timeoutMs });
  return cachedClient;
};

const resetOpenAIClient = () => {
  cachedClient = null;
};

module.exports = {
  getOpenAIClient,
  resetOpenAIClient,
  getOpenAIEnvironment,
};

