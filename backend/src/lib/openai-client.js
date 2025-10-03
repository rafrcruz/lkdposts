const config = require('../config');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

let cachedClient = null;

const createClient = ({ timeoutMs }) => {
  const apiKey = config.openai?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const baseUrlRaw = config.openai?.baseUrl ?? process.env.OPENAI_BASE_URL ?? '';
  const baseUrl = baseUrlRaw.trim().replace(/\/?$/, '') || DEFAULT_BASE_URL;
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : config.openai?.timeoutMs ?? 30000;

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
};

