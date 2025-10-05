const postGenerationService = require('../src/services/post-generation.service');
const appParamsService = require('../src/services/app-params.service');
const { prisma } = require('../src/lib/prisma');
const { __mockClient } = require('../src/lib/openai-client');

const OWNER_KEY = '1';
const USER_ID = 1;

const createPrompt = async ({
  title = 'Estilo',
  content = 'Siga o estilo profissional.',
  position = 1,
  enabled = true,
} = {}) =>
  prisma.prompt.create({
    data: {
      userId: USER_ID,
      title,
      content,
      position,
      enabled,
    },
  });

const createFeed = async ({
  ownerKey = OWNER_KEY,
  url = 'https://example.com/feed.xml',
  title = 'Feed Principal',
  lastFetchedAt = null,
} = {}) =>
  prisma.feed.create({
    data: {
      ownerKey,
      url,
      title,
      lastFetchedAt,
    },
  });

const createArticle = async ({
  feedId,
  title,
  contentSnippet,
  articleHtml = '<p>Conteúdo da notícia.</p>',
  publishedAt,
  guid,
  link,
  dedupeKey,
} = {}) =>
  prisma.article.create({
    data: {
      feedId,
      title,
      contentSnippet,
      articleHtml,
      publishedAt,
      guid,
      link,
      dedupeKey,
    },
  });

describe('post-generation.service integration', () => {
  beforeEach(async () => {
    prisma.__reset();
    __mockClient.responses.create.mockReset();
    await appParamsService.ensureDefaultAppParams();
    await createPrompt();
  });

  it('builds a valid payload and records usage data without triggering HTTP 400', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    const article = await createArticle({
      feedId: feed.id,
      title: 'Notícia exemplo',
      contentSnippet: 'Resumo da notícia',
      publishedAt: new Date('2025-01-01T11:30:00Z').toISOString(),
      guid: 'guid-1',
      link: 'https://example.com/noticia-1',
      dedupeKey: 'hash-1',
    });

    const capturedPayloads = [];
    __mockClient.responses.create.mockImplementation(async (payload) => {
      capturedPayloads.push(payload);

      expect(payload).toEqual(
        expect.objectContaining({
          model: 'gpt-5-nano',
          input: [
            expect.objectContaining({
              role: 'system',
              content: [
                expect.objectContaining({
                  type: 'input_text',
                  text: expect.stringContaining('Instrução final'),
                }),
              ],
            }),
            expect.objectContaining({
              role: 'user',
              content: [
                expect.objectContaining({
                  type: 'input_text',
                  text: expect.stringContaining('Notícia ID interno'),
                }),
              ],
            }),
          ],
        }),
      );

      expect(payload.input[0].content[0]).not.toHaveProperty('cache_control');
      expect(payload.input[1].content[0].text).not.toContain('Instrução final');

      return {
        id: 'resp-1',
        model: 'gpt-5-nano',
        output_text: 'Post gerado automaticamente.',
        usage: {
          input_tokens: 128,
          output_tokens: 96,
        },
      };
    });

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(__mockClient.responses.create).toHaveBeenCalledTimes(1);
    expect(capturedPayloads).toHaveLength(1);
    expect(summary).toEqual(
      expect.objectContaining({
        generatedCount: 1,
        failedCount: 0,
      }),
    );
    expect(summary.cacheInfo).toBeUndefined();

    const storedPosts = await prisma.post.findMany({ where: { articleId: article.id } });
    expect(storedPosts).toHaveLength(1);
    expect(storedPosts[0]).toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        tokensInput: 128,
        tokensOutput: 96,
      }),
    );
  });

  it('extracts generated text from structured output blocks when output_text is missing', async () => {
    const now = new Date('2025-01-01T13:00:00Z');
    const feed = await createFeed();
    const article = await createArticle({
      feedId: feed.id,
      title: 'Structured output',
      contentSnippet: 'Resumo estruturado',
      publishedAt: new Date('2025-01-01T12:45:00Z').toISOString(),
      guid: 'structured-1',
      link: 'https://example.com/structured-1',
      dedupeKey: 'structured-1',
    });

    __mockClient.responses.create.mockImplementationOnce(async () => ({
      id: 'resp-structured',
      model: 'gpt-5-nano',
      output: [
        {
          content: [
            { type: 'text', text: 'Primeiro bloco gerado.' },
            { type: 'output_text', text: 'Segundo bloco gerado.' },
          ],
        },
      ],
      usage: { input_tokens: 142, output_tokens: 88 },
    }));

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(summary.generatedCount).toBe(1);
    const storedPosts = await prisma.post.findMany({ where: { articleId: article.id } });
    expect(storedPosts).toHaveLength(1);
    expect(storedPosts[0].content).toBe('Primeiro bloco gerado.\n\nSegundo bloco gerado.');
  });

  it('marks a failure with a 502 message when the response has no textual content', async () => {
    const now = new Date('2025-01-01T14:00:00Z');
    const feed = await createFeed();
    const article = await createArticle({
      feedId: feed.id,
      title: 'Sem texto',
      contentSnippet: 'Resposta vazia',
      publishedAt: new Date('2025-01-01T13:45:00Z').toISOString(),
      guid: 'empty-1',
      link: 'https://example.com/empty-1',
      dedupeKey: 'empty-1',
    });

    __mockClient.responses.create.mockResolvedValueOnce({
      id: 'resp-empty',
      model: 'gpt-5-nano',
      output: [
        {
          content: [
            { type: 'json', data: '{"foo":"bar"}' },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 0 },
    });

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(summary.generatedCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(summary.errors).toEqual([
      {
        articleId: article.id,
        reason: 'Falha ao extrair texto do Responses API',
      },
    ]);

    const storedPosts = await prisma.post.findMany({ where: { articleId: article.id } });
    expect(storedPosts).toHaveLength(1);
    expect(storedPosts[0]).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        content: null,
        errorReason: 'Falha ao extrair texto do Responses API',
      }),
    );
  });

  it('keeps the prefix stable across requests and exposes cached token metrics when available', async () => {
    const baseNow = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Primeira notícia',
      contentSnippet: 'Resumo 1',
      publishedAt: new Date('2025-01-01T11:00:00Z').toISOString(),
      guid: 'guid-1',
      link: 'https://example.com/noticia-1',
      dedupeKey: 'hash-1',
    });

    const payloads = [];
    const responses = [
      {
        output_text: 'Primeiro post gerado.',
        usage: { input_tokens: 110, output_tokens: 70 },
      },
      {
        output_text: 'Segundo post gerado.',
        usage: { input_tokens: 112, output_tokens: 72, prompt_tokens_details: { cached_tokens: 12 } },
      },
    ];

    __mockClient.responses.create.mockImplementation(async (payload) => {
      const index = payloads.length;
      payloads.push(payload);

      return {
        id: `resp-${index + 1}`,
        model: 'gpt-5-nano',
        output_text: responses[index].output_text,
        usage: responses[index].usage,
      };
    });

    await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now: baseNow });

    await createArticle({
      feedId: feed.id,
      title: 'Segunda notícia',
      contentSnippet: 'Resumo 2',
      publishedAt: new Date('2025-01-01T11:45:00Z').toISOString(),
      guid: 'guid-2',
      link: 'https://example.com/noticia-2',
      dedupeKey: 'hash-2',
    });

    const laterSummary = await postGenerationService.generatePostsForOwner({
      ownerKey: OWNER_KEY,
      now: new Date('2025-01-01T12:05:00Z'),
    });

    expect(payloads).toHaveLength(2);
    expect(payloads[0].input[0].content[0].text).toContain('Instrução final');
    expect(payloads[1].input[0].content[0].text).toBe(payloads[0].input[0].content[0].text);
    expect(payloads[1].input[1].content[0].text).not.toBe(payloads[0].input[1].content[0].text);

    if (laterSummary.cacheInfo) {
      expect(laterSummary.cacheInfo.cachedTokens).toBeGreaterThanOrEqual(0);
    }

    const storedPosts = await prisma.post.findMany();
    expect(storedPosts.filter((post) => post.status === 'SUCCESS')).toHaveLength(2);
  });
  it('retries transient 429 errors and succeeds on the next attempt', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Notícia para retry',
      contentSnippet: 'Resumo',
      publishedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
      guid: 'retry-1',
      link: 'https://example.com/retry-1',
      dedupeKey: 'retry-1',
    });

    const payloads = [];
    __mockClient.responses.create
      .mockImplementationOnce(() => {
        const error = new Error('Rate limited');
        error.status = 429;
        return Promise.reject(error);
      })
      .mockImplementationOnce(async (payload) => {
        payloads.push(payload);
        return {
          id: 'resp-retry',
          model: 'gpt-5-nano',
          output_text: 'Conteúdo após retry.',
          usage: { input_tokens: 120, output_tokens: 90 },
        };
      });

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(__mockClient.responses.create).toHaveBeenCalledTimes(2);
    expect(payloads).toHaveLength(1);
    expect(summary).toEqual(
      expect.objectContaining({
        generatedCount: 1,
        failedCount: 0,
      }),
    );
  });

  it('reports a friendly timeout message when OpenAI exceeds the configured deadline', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Notícia com timeout',
      contentSnippet: 'Resumo timeout',
      publishedAt: new Date('2025-01-01T10:05:00Z').toISOString(),
      guid: 'timeout-1',
      link: 'https://example.com/timeout-1',
      dedupeKey: 'timeout-1',
    });

    const timeoutError = new Error('OpenAI request timed out');
    timeoutError.status = 408;
    __mockClient.responses.create.mockRejectedValueOnce(timeoutError);

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(summary.failedCount).toBe(1);
    expect(summary.errors).toEqual([
      {
        articleId: expect.any(Number),
        reason: 'A solicitação à OpenAI excedeu o tempo limite. Tente novamente em instantes.',
      },
    ]);
  });

  it('truncates oversized article content and annotates the payload', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    const largeHtml = `<p>${'a'.repeat(9000)}</p>`;

    await createArticle({
      feedId: feed.id,
      title: 'Notícia extensa',
      contentSnippet: 'Resumo longo',
      articleHtml: largeHtml,
      publishedAt: new Date('2025-01-01T11:00:00Z').toISOString(),
      guid: 'long-1',
      link: 'https://example.com/long-1',
      dedupeKey: 'long-1',
    });

    const payloads = [];
    __mockClient.responses.create.mockImplementation(async (payload) => {
      payloads.push(payload);
      return {
        id: 'resp-long',
        model: payload.model,
        output_text: 'Conteúdo gerado.',
        usage: { input_tokens: 200, output_tokens: 150 },
      };
    });

    await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(payloads).toHaveLength(1);
    const userText = payloads[0].input[1].content[0].text;
    const htmlSection = userText.split('Conteúdo HTML:\n')[1] ?? '';
    const [newsBody] = htmlSection.split('\n\nLink:');
    const truncationIndicator = '\n\n[Conteúdo truncado para atender limites]';

    expect(newsBody).toBeDefined();
    expect(newsBody.endsWith(truncationIndicator)).toBe(true);
    expect(newsBody.length).toBeLessThanOrEqual(8000 + truncationIndicator.length);
  });

  it('falls back to gpt-5-nano when the configured model is not supported', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Notícia fallback',
      contentSnippet: 'Resumo fallback',
      publishedAt: new Date('2025-01-01T09:45:00Z').toISOString(),
      guid: 'fallback-1',
      link: 'https://example.com/fallback-1',
      dedupeKey: 'fallback-1',
    });

    await prisma.appParams.update({
      data: { openAiModel: 'gpt-5-ultra' },
    });

    const payloads = [];
    __mockClient.responses.create.mockImplementation(async (payload) => {
      payloads.push(payload);
      return {
        id: 'resp-fallback',
        model: payload.model,
        output_text: 'Fallback aplicado.',
        usage: { input_tokens: 118, output_tokens: 92 },
      };
    });

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(payloads).toHaveLength(1);
    expect(payloads[0].model).toBe('gpt-5-nano');
    expect(summary.modelUsed).toBe('gpt-5-nano');
  });


  it('retries transient 429 errors and succeeds on the next attempt', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Notícia para retry',
      contentSnippet: 'Resumo',
      publishedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
      guid: 'retry-1',
      link: 'https://example.com/retry-1',
      dedupeKey: 'retry-1',
    });

    const payloads = [];
    __mockClient.responses.create
      .mockImplementationOnce(() => {
        const error = new Error('Rate limited');
        error.status = 429;
        return Promise.reject(error);
      })
      .mockImplementationOnce(async (payload) => {
        payloads.push(payload);
        return {
          id: 'resp-retry',
          model: 'gpt-5-nano',
          output_text: 'Conteúdo após retry.',
          usage: { input_tokens: 120, output_tokens: 90 },
        };
      });

    const summary = await postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    expect(__mockClient.responses.create).toHaveBeenCalledTimes(2);
    expect(payloads).toHaveLength(1);
    expect(summary).toEqual(
      expect.objectContaining({
        generatedCount: 1,
        failedCount: 0,
      }),
    );
  });
  it('returns the latest status immediately when waitForCompletion is false', async () => {
    const now = new Date('2025-01-02T08:00:00Z');
    const feed = await createFeed();
    await createArticle({
      feedId: feed.id,
      title: 'Notícia assíncrona',
      contentSnippet: 'Resumo assíncrono',
      publishedAt: new Date('2025-01-02T07:45:00Z').toISOString(),
      guid: 'async-1',
      link: 'https://example.com/async-1',
      dedupeKey: 'async-1',
    });

    let resolveResponse;
    const pendingResponse = new Promise((resolve) => {
      resolveResponse = resolve;
    });

    __mockClient.responses.create.mockImplementationOnce(() => pendingResponse);

    const firstTrigger = await postGenerationService.generatePostsForOwner({
      ownerKey: OWNER_KEY,
      now,
      waitForCompletion: false,
    });

    expect(firstTrigger.alreadyRunning).toBe(false);
    expect(firstTrigger.status).toEqual(
      expect.objectContaining({
        ownerKey: OWNER_KEY,
        status: 'in_progress',
      }),
    );

    const secondTrigger = await postGenerationService.generatePostsForOwner({
      ownerKey: OWNER_KEY,
      now,
      waitForCompletion: false,
    });

    expect(secondTrigger.alreadyRunning).toBe(true);
    expect(secondTrigger.status).not.toBeNull();

    const completionPromise = postGenerationService.generatePostsForOwner({ ownerKey: OWNER_KEY, now });

    resolveResponse({
      id: 'resp-async',
      model: 'gpt-5-nano',
      output_text: 'Post assíncrono gerado.',
      usage: { input_tokens: 110, output_tokens: 85 },
    });

    const summary = await completionPromise;

    expect(summary.generatedCount).toBe(1);
    expect(postGenerationService.getLatestStatus(OWNER_KEY)).toEqual(
      expect.objectContaining({
        status: 'completed',
        summary: expect.objectContaining({ generatedCount: 1 }),
      }),
    );
  });



});
