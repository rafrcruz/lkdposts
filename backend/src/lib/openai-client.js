const config = require('../config');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 30000;

let cachedClient = null;

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
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, effectiveTimeout);

      try {
        const response = await fetch(`${baseUrl}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          let parsedPayload = null;
          let openAiError = null;

          try {
            const contentType = response.headers.get('content-type') ?? '';
            if (contentType.includes('application/json')) {
              parsedPayload = await response.json();
            } else {
              parsedPayload = await response.text();
            }
          } catch (parseError) {
            console.warn('Failed to parse OpenAI error response payload', parseError);
            parsedPayload = null;
          }

          if (parsedPayload && typeof parsedPayload === 'object') {
            const candidate =
              Object.hasOwn(parsedPayload, 'error') && typeof parsedPayload.error === 'object'
                ? parsedPayload.error
                : parsedPayload;

            openAiError = {
              type: typeof candidate.type === 'string' ? candidate.type : null,
              code: typeof candidate.code === 'string' ? candidate.code : null,
              message: typeof candidate.message === 'string' ? candidate.message : null,
            };
          }

          const error = new Error(`OpenAI request failed with status ${response.status}`);
          error.status = response.status;
          error.response = response;
          if (openAiError) {
            error.openai = openAiError;
          }
          if (parsedPayload && typeof parsedPayload !== 'string') {
            error.payload = parsedPayload;
          }
          throw error;
        }

        return response.json();
      } catch (error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error('OpenAI request timed out');
          timeoutError.status = 408;
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timer);
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

