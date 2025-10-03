const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const Sentry = require('@sentry/node');

const promptRepository = require('../repositories/prompt.repository');
const articleRepository = require('../repositories/article.repository');
const postRepository = require('../repositories/post.repository');
const config = require('../config');
const { getOpenAIModel } = require('./app-params.service');
const { resolveOperationalParams } = require('./posts-operational-params');
const { getOpenAIClient } = require('../lib/openai-client');

const MAX_GENERATION_ATTEMPTS = 3;
const MAX_ERROR_REASON_LENGTH = 240;
const PROMPT_SEPARATOR = '\n---\n';
const FINAL_INSTRUCTION = 'Instrução final: gerar um post para LinkedIn com base na notícia e no contexto acima.';

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const generationLocks = new Map();
const latestGenerationStatus = new Map();

const ensureDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }

  return new Date();
};

const toUserId = (ownerKey) => {
  const parsed = Number.parseInt(ownerKey, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError('Invalid owner key for prompt resolution');
  }
  return parsed;
};

const normalizeMultiline = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replaceAll(/\r\n?/g, '\n').trim();
};

const buildSystemPromptText = (basePrompt) => {
  const parts = [];

  const trimmedBase = typeof basePrompt === 'string' ? basePrompt.trim() : '';
  if (trimmedBase) {
    parts.push(trimmedBase);
  }

  parts.push(FINAL_INSTRUCTION);

  return parts.join('\n\n').trim();
};

const buildPromptBase = async ({ ownerKey }) => {
  const userId = toUserId(ownerKey);
  const prompts = await promptRepository.findManyByUser({
    userId,
    enabled: true,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  const sections = [];

  for (const prompt of prompts) {
    const title = normalizeMultiline(prompt.title ?? '');
    const content = normalizeMultiline(prompt.content ?? '');

    const blockParts = [];
    if (title) {
      blockParts.push(title);
    }
    if (content) {
      blockParts.push(content);
    }

    const block = blockParts.join('\n\n').trim();
    if (block) {
      sections.push(block);
    }
  }

  const basePrompt = sections.join(PROMPT_SEPARATOR);
  const systemPrompt = buildSystemPromptText(basePrompt);
  const promptBaseHash = createHash('sha256').update(systemPrompt).digest('hex');

  return { basePrompt, promptBaseHash };
};

const extractGeneratedText = (response) => {
  if (!response) {
    return '';
  }

  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  if (Array.isArray(response.output)) {
    const collected = [];
    for (const chunk of response.output) {
      if (!chunk || !Array.isArray(chunk.content)) {
        continue;
      }
      for (const entry of chunk.content) {
        if (!entry) {
          continue;
        }
        if (typeof entry.text === 'string' && entry.text.trim().length > 0) {
          collected.push(entry.text.trim());
        }
        if (typeof entry.type === 'string' && entry.type === 'output_text' && typeof entry.data === 'string') {
          const trimmed = entry.data.trim();
          if (trimmed) {
            collected.push(trimmed);
          }
        }
      }
    }

    if (collected.length > 0) {
      return collected.join('\n').trim();
    }
  }

  if (Array.isArray(response.choices) && response.choices.length > 0) {
    const first = response.choices[0];
    if (first && first.message) {
      if (typeof first.message.content === 'string' && first.message.content.trim().length > 0) {
        return first.message.content.trim();
      }

      if (Array.isArray(first.message.content)) {
        const collected = [];
        for (const entry of first.message.content) {
          if (!entry) {
            continue;
          }

          if (typeof entry.text === 'string' && entry.text.trim().length > 0) {
            collected.push(entry.text.trim());
          }
          if (typeof entry === 'string' && entry.trim().length > 0) {
            collected.push(entry.trim());
          }
        }

        if (collected.length > 0) {
          return collected.join('\n').trim();
        }
      }
    }
  }

  return '';
};

const buildArticleContext = (article) => {
  const parts = [];

  parts.push(`Notícia ID interno: ${article.id}`);

  if (article.feed) {
    const feedNameParts = [];
    if (article.feed.title) {
      feedNameParts.push(article.feed.title);
    }
    if (article.feed.url) {
      feedNameParts.push(`URL: ${article.feed.url}`);
    }
    if (feedNameParts.length > 0) {
      parts.push(`Feed: ${feedNameParts.join(' · ')}`);
    }
  }

  if (article.title) {
    parts.push(`Título: ${article.title}`);
  }

  if (article.publishedAt instanceof Date && !Number.isNaN(article.publishedAt.valueOf())) {
    parts.push(`Publicado em: ${article.publishedAt.toISOString()}`);
  }

  if (article.contentSnippet) {
    parts.push(`Resumo: ${article.contentSnippet}`);
  }

  if (article.articleHtml) {
    parts.push(`Conteúdo HTML:
${article.articleHtml}`);
  }

  if (article.link) {
    parts.push(`Link: ${article.link}`);
  }

  if (article.guid) {
    parts.push(`GUID: ${article.guid}`);
  }

  return parts.join('\n\n');
};

const collectEligibleArticles = async ({ ownerKey, startedAt, operationalParams, maxAttempts }) => {
  const windowStart = new Date(startedAt.valueOf() - operationalParams.windowMs);
  const articles = await articleRepository.findAllWithinWindowForOwner({
    ownerKey,
    windowStart,
    currentTime: startedAt,
  });

  const eligible = [];
  let skippedCount = 0;

  for (const article of articles) {
    const post = article.post;
    if (post && post.status === 'SUCCESS') {
      skippedCount += 1;
      continue;
    }

    const attempts = post?.attemptCount ?? 0;
    if (attempts >= maxAttempts) {
      skippedCount += 1;
      continue;
    }

    eligible.push(article);
  }

  return { eligible, skippedCount };
};

const mapArticleForPayload = (article) => ({
  id: article.id,
  title: article.title,
  contentSnippet: article.contentSnippet,
  articleHtml: article.articleHtml ?? null,
  link: article.link ?? null,
  guid: article.guid ?? null,
  publishedAt:
    article.publishedAt instanceof Date && !Number.isNaN(article.publishedAt.valueOf())
      ? article.publishedAt.toISOString()
      : article.publishedAt ?? null,
  feed: article.feed
    ? {
        id: article.feed.id,
        title: article.feed.title ?? null,
        url: article.feed.url ?? null,
      }
    : null,
});

class ArticleNotFoundError extends Error {
  constructor(articleId) {
    super('Article not found for preview');
    this.name = 'ArticleNotFoundError';
    this.articleId = articleId;
  }
}

const buildNewsPayload = (article) => {
  const context = buildArticleContext(article);

  return {
    article: mapArticleForPayload(article),
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text: context,
        },
      ],
    },
    context,
  };
};

const buildPostRequestPreview = async ({
  ownerKey,
  newsId,
  now = new Date(),
  operationalParams: overrides,
  maxAttempts = MAX_GENERATION_ATTEMPTS,
} = {}) => {
  if (!ownerKey) {
    throw new TypeError('ownerKey is required');
  }

  const startedAt = ensureDate(now);
  const operationalParams = await resolveOperationalParams(overrides);
  const promptBase = await buildPromptBase({ ownerKey });
  const model = await getOpenAIModel();
  const systemPrompt = buildSystemPromptText(promptBase.basePrompt);

  let article = null;

  if (newsId != null) {
    const normalizedId = Number.parseInt(newsId, 10);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      throw new TypeError('newsId must be a positive integer');
    }

    article = await articleRepository.findByIdForOwner({ id: normalizedId, ownerKey });
    if (!article) {
      throw new ArticleNotFoundError(normalizedId);
    }
  } else {
    const { eligible } = await collectEligibleArticles({
      ownerKey,
      startedAt,
      operationalParams,
      maxAttempts,
    });
    article = eligible.at(0) ?? null;
  }

  const newsPayload = article ? buildNewsPayload(article) : null;

  try {
    Sentry.addBreadcrumb({
      category: 'preview',
      level: 'info',
      message: 'post-request-preview',
      data: {
        newsId: article?.id ?? null,
        promptBaseHash: promptBase.promptBaseHash,
        hasNews: Boolean(article),
      },
    });
  } catch (error) {
    console.warn('Failed to record preview breadcrumb', error);
  }

  return {
    promptBase: systemPrompt,
    promptBaseHash: promptBase.promptBaseHash,
    newsPayload,
    model,
  };
};

const callOpenAIWithRetry = async ({ client, payload, maxRetries, timeoutMs }) => {
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    try {
      if (client && typeof client.withOptions === 'function') {
        const response = await client.withOptions({ timeout: timeoutMs }).responses.create(payload);
        return response;
      }

      const response = await client.responses.create(payload);
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.status ?? error?.response?.status ?? error?.cause?.status ?? null;
      const isRetryable = status != null && RETRYABLE_HTTP_STATUSES.has(status);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delayMs = 500 * Math.max(1, attempt + 1);
      await delay(delayMs);
      attempt += 1;
    }
  }

  throw lastError ?? new Error('OpenAI call failed');
};

const truncateError = (value) => {
  if (typeof value !== 'string') {
    if (value instanceof Error) {
      return truncateError(value.message);
    }
    return 'Unknown error';
  }

  if (value.length <= MAX_ERROR_REASON_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_ERROR_REASON_LENGTH - 1)}…`;
};

const ensureOpenAIClient = (client) => {
  if (client) {
    return client;
  }
  return getOpenAIClient();
};

const buildGenerationPayload = ({ article, basePrompt, model }) => {
  const context = buildArticleContext(article);
  const systemText = buildSystemPromptText(basePrompt);

  return {
    model,
    input: [
      {
        role: 'system',
        content: systemText
          ? [
              {
                type: 'text',
                text: systemText,
              },
            ]
          : [],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: context,
          },
        ],
      },
    ],
  };
};

const createPromptBaseOrRecordFailure = async ({ ownerKey, startedAt }) => {
  try {
    return await buildPromptBase({ ownerKey });
  } catch (error) {
    const reason = truncateError(error instanceof Error ? error.message : String(error));
    const summary = computeSummary({
      ownerKey,
      startedAt,
      finishedAt: ensureDate(new Date()),
      eligibleCount: 0,
      generatedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      promptBaseHash: null,
      model: null,
      errors: [{ articleId: null, reason }],
    });
    recordStatus(ownerKey, summary);
    throw error;
  }
};

const recordEmptySummary = ({ ownerKey, startedAt, skippedCount, promptBaseHash, errors }) => {
  const summary = computeSummary({
    ownerKey,
    startedAt,
    finishedAt: ensureDate(new Date()),
    eligibleCount: 0,
    generatedCount: 0,
    failedCount: 0,
    skippedCount,
    promptBaseHash,
    model: null,
    errors,
  });
  recordStatus(ownerKey, summary);
  return summary;
};

const generatePostForArticle = async ({
  article,
  basePrompt,
  model,
  client,
  timeoutMs,
  promptBaseHash,
}) => {
  const payload = buildGenerationPayload({ article, basePrompt, model });
  const nextAttemptCount = (article.post?.attemptCount ?? 0) + 1;

  try {
    const response = await callOpenAIWithRetry({
      client,
      payload,
      maxRetries: 2,
      timeoutMs,
    });

    const generatedText = extractGeneratedText(response);
    if (!generatedText) {
      throw new Error('OpenAI response did not contain text output');
    }

    const usage = response?.usage ?? {};
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;

    if (process.env.NODE_ENV !== 'production' && response?.usage) {
      const usageLog = {
        model: response?.model ?? model,
        input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
        output_tokens: usage.output_tokens ?? usage.completion_tokens ?? null,
      };

      if (cachedTokens !== undefined) {
        usageLog.cached_tokens = cachedTokens;
      }

      console.info('openai.responses.usage', usageLog);
    }

    await postRepository.upsertForArticle({
      articleId: article.id,
      data: {
        content: generatedText,
        status: 'SUCCESS',
        generatedAt: ensureDate(new Date()),
        modelUsed: response?.model ?? model,
        tokensInput: usage?.input_tokens ?? usage?.prompt_tokens ?? null,
        tokensOutput: usage?.output_tokens ?? usage?.completion_tokens ?? null,
        errorReason: null,
        promptBaseHash,
        attemptCount: nextAttemptCount,
      },
    });

    return {
      success: true,
      cacheInfo: cachedTokens === undefined ? undefined : { cachedTokens },
    };
  } catch (error) {
    const reason = truncateError(error instanceof Error ? error.message : String(error));
    await postRepository.upsertForArticle({
      articleId: article.id,
      data: {
        status: 'FAILED',
        errorReason: reason,
        promptBaseHash,
        attemptCount: nextAttemptCount,
      },
    });
    return { success: false, reason };
  }
};

const computeSummary = ({
  ownerKey,
  startedAt,
  finishedAt,
  eligibleCount,
  generatedCount,
  failedCount,
  skippedCount,
  promptBaseHash,
  model,
  errors = [],
  cacheInfo,
}) => {
  const summary = {
    ownerKey,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    eligibleCount,
    generatedCount,
    failedCount,
    skippedCount,
    promptBaseHash,
    modelUsed: model,
    errors: Array.isArray(errors) && errors.length > 0 ? errors : null,
  };

  if (cacheInfo && Object.hasOwn(cacheInfo, 'cachedTokens')) {
    summary.cacheInfo = cacheInfo;
  }

  return summary;
};

const recordStatus = (ownerKey, status) => {
  latestGenerationStatus.set(ownerKey, status);
};

const getLatestStatus = (ownerKey) => latestGenerationStatus.get(ownerKey) ?? null;

const generatePostsForOwner = async ({
  ownerKey,
  now = new Date(),
  client,
  operationalParams: overrides,
  maxAttempts = MAX_GENERATION_ATTEMPTS,
} = {}) => {
  if (!ownerKey) {
    throw new TypeError('ownerKey is required');
  }

  const activeLock = generationLocks.get(ownerKey);
  if (activeLock) {
    return activeLock;
  }

  const promise = (async () => {
    const startedAt = ensureDate(now);
    const errors = [];

    const operationalParams = await resolveOperationalParams(overrides);
    const promptBase = await createPromptBaseOrRecordFailure({ ownerKey, startedAt });
    const promptBaseHash = promptBase.promptBaseHash;
    const basePrompt = promptBase.basePrompt;

    const { eligible, skippedCount } = await collectEligibleArticles({
      ownerKey,
      startedAt,
      operationalParams,
      maxAttempts,
    });

    if (eligible.length === 0) {
      return recordEmptySummary({
        ownerKey,
        startedAt,
        skippedCount,
        promptBaseHash,
        errors,
      });
    }

    const model = await getOpenAIModel();
    const openAiClient = ensureOpenAIClient(client);
    const timeoutMs = config.openai?.timeoutMs ?? 60000;

    let generatedCount = 0;
    let failedCount = 0;
    let cacheInfo;

    for (const article of eligible) {
      const result = await generatePostForArticle({
        article,
        basePrompt,
        model,
        client: openAiClient,
        timeoutMs,
        promptBaseHash,
      });

      if (result.cacheInfo) {
        cacheInfo = result.cacheInfo;
      }

      if (result.success) {
        generatedCount += 1;
        continue;
      }

      failedCount += 1;
      errors.push({ articleId: article.id, reason: result.reason });
    }

    const summary = computeSummary({
      ownerKey,
      startedAt,
      finishedAt: ensureDate(new Date()),
      eligibleCount: eligible.length,
      generatedCount,
      failedCount,
      skippedCount,
      promptBaseHash,
      model,
      errors,
      cacheInfo,
    });

    recordStatus(ownerKey, summary);
    return summary;
  })().finally(() => {
    generationLocks.delete(ownerKey);
  });

  generationLocks.set(ownerKey, promise);
  return promise;
};

module.exports = {
  generatePostsForOwner,
  getLatestStatus,
  buildPromptBase,
  buildArticleContext,
  buildPostRequestPreview,
  ArticleNotFoundError,
  MAX_GENERATION_ATTEMPTS,
};

