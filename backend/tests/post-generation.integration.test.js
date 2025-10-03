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
                  type: 'text',
                  text: expect.stringContaining('Instrução final'),
                }),
              ],
            }),
            expect.objectContaining({
              role: 'user',
              content: [
                expect.objectContaining({
                  type: 'text',
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
});
