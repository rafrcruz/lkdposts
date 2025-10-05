const { performance } = require('node:perf_hooks');

const { getOpenAIClient, getOpenAIEnvironment } = require('../lib/openai-client');
const { getOpenAIModel } = require('./app-params.service');

const DIAG_MESSAGES = [
  { role: 'system', content: 'ping' },
  { role: 'user', content: 'hello' },
];

const sanitizeModelParam = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const getErrorStatus = (error) => error?.status ?? error?.response?.status ?? error?.cause?.status ?? null;

const extractErrorDetails = (error) => {
  const status = getErrorStatus(error);
  const candidate =
    error && typeof error === 'object' ? (error.openai ?? error.payload?.error ?? error.payload ?? null) : null;

  const details = {
    status,
    type: null,
    code: null,
    message: null,
  };

  if (candidate && typeof candidate === 'object') {
    if (typeof candidate.type === 'string') {
      details.type = candidate.type;
    }
    if (typeof candidate.code === 'string') {
      details.code = candidate.code;
    }
    if (typeof candidate.message === 'string') {
      details.message = candidate.message;
    }
  }

  const isMessageMissing =
    details.message === null || details.message === undefined || details.message === '';
  if (isMessageMissing && error instanceof Error && typeof error.message === 'string') {
    details.message = error.message;
  }

  return details;
};

const extractRequestId = (error) => {
  if (error && typeof error === 'object') {
    const response = error.response ?? null;
    if (response) {
      if (typeof response.headers?.get === 'function') {
        return response.headers.get('x-request-id');
      }

      const headers = response.headers;
      if (headers && typeof headers === 'object') {
        const candidate = headers['x-request-id'] ?? headers['X-Request-Id'] ?? null;
        if (typeof candidate === 'string') {
          return candidate;
        }
      }
    }
  }

  return null;
};

const logDiagResult = ({ status, type, code, requestId }) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.debug('openai.diag', {
    status: status ?? null,
    type: type ?? null,
    code: code ?? null,
    request_id: requestId ?? null,
  });
};

const runDiagnostics = async ({ model } = {}) => {
  const requestedModel = sanitizeModelParam(model);
  const targetModel = requestedModel ?? (await getOpenAIModel());
  const { baseUrl, timeoutMs } = getOpenAIEnvironment();

  const payload = {
    model: targetModel,
    input: DIAG_MESSAGES,
  };

  const client = getOpenAIClient();
  const startedAt = performance.now();

  try {
    const response = await client.responses.create(payload);
    const latencyMs = Math.round(performance.now() - startedAt);
    const usage = response && typeof response === 'object' ? response.usage ?? null : null;
    const cachedTokens =
      usage && typeof usage === 'object' && typeof usage.cached_tokens === 'number' ? usage.cached_tokens : null;

    logDiagResult({ status: 200, type: null, code: null, requestId: response?.id ?? null });

    const cachedTokensPayload = cachedTokens === null ? {} : { cachedTokens };

    return {
      ok: true,
      model: targetModel,
      baseURL: baseUrl,
      timeoutMs,
      latencyMs,
      usage,
      ...cachedTokensPayload,
    };
  } catch (error) {
    const details = extractErrorDetails(error);
    const requestId = extractRequestId(error);
    const latencyMs = Math.round(performance.now() - startedAt);

    logDiagResult({ status: details.status ?? null, type: details.type, code: details.code, requestId });

    return {
      ok: false,
      model: targetModel,
      baseURL: baseUrl,
      timeoutMs,
      latencyMs,
      error: {
        status: details.status ?? null,
        type: details.type ?? null,
        code: details.code ?? null,
        message: details.message ?? null,
        request_id: requestId ?? null,
      },
    };
  }
};

module.exports = {
  runDiagnostics,
};
