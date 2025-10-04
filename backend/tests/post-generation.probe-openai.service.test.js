const { prisma } = require('../src/lib/prisma');
const postGenerationService = require('../src/services/post-generation.service');
const { __mockClient } = require('../src/lib/openai-client');

const createPrompt = ({ userId, title, content, position, enabled = true }) =>
  prisma.prompt.create({ data: { userId, title, content, position, enabled } });

const createFeed = ({ ownerKey, title = 'Feed de notícias', url = 'https://example.com/feed.xml' }) =>
  prisma.feed.create({ data: { ownerKey, title, url } });

const createArticle = ({
  feedId,
  title,
  contentSnippet = 'Resumo da notícia',
  articleHtml = '<p>Conteúdo detalhado</p>',
  publishedAt = new Date('2024-01-01T12:00:00.000Z'),
  link = 'https://example.com/news',
  guid = 'guid-news',
  dedupeKey = 'dedupe-news',
}) =>
  prisma.article.create({
    data: {
      feedId,
      title,
      contentSnippet,
      articleHtml,
      publishedAt,
      link,
      guid,
      dedupeKey,
    },
  });

describe('postGenerationService.probeOpenAIResponse', () => {
  beforeEach(async () => {
    prisma.__reset();
    __mockClient.responses.create.mockReset();
    __mockClient.withOptions.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the raw OpenAI response payload on success', async () => {
    const adminUser = await prisma.allowedUser.create({ data: { email: 'admin@example.com', role: 'admin' } });
    const ownerKey = String(adminUser.id);
    await createPrompt({ userId: adminUser.id, title: 'Prompt base', content: 'Contexto adicional', position: 0 });
    const feed = await createFeed({ ownerKey });
    const article = await createArticle({ feedId: feed.id, title: 'Notícia alvo' });

    const rawResponse = {
      id: 'resp_123',
      model: 'gpt-5-nano',
      output: [
        {
          id: 'choice-1',
          type: 'message',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Post gerado pela OpenAI',
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 120, output_tokens: 80 },
    };

    __mockClient.responses.create.mockResolvedValueOnce(rawResponse);

    const response = await postGenerationService.probeOpenAIResponse({
      ownerKey,
      newsId: article.id,
    });

    expect(response).toBe(rawResponse);
    expect(__mockClient.withOptions).toHaveBeenCalledWith({ timeout: expect.any(Number) });
    expect(__mockClient.responses.create).toHaveBeenCalledTimes(1);

    const payload = __mockClient.responses.create.mock.calls[0][0];
    expect(payload.model).toBe('gpt-5-nano');
    expect(payload.input).toHaveLength(2);
    expect(payload.input[0]).toEqual(
      expect.objectContaining({
        role: 'system',
      }),
    );
    expect(payload.input[1]).toEqual(
      expect.objectContaining({
        role: 'user',
      }),
    );
  });

  it('propagates OpenAI errors with status and raw payload', async () => {
    const adminUser = await prisma.allowedUser.create({ data: { email: 'admin@example.com', role: 'admin' } });
    const ownerKey = String(adminUser.id);
    await createPrompt({ userId: adminUser.id, title: 'Prompt base', content: 'Contexto adicional', position: 0 });
    const feed = await createFeed({ ownerKey });
    const article = await createArticle({ feedId: feed.id, title: 'Notícia alvo' });

    const error = new Error('OpenAI request failed with status 429');
    error.status = 429;
    error.payload = {
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit',
        message: 'Too many requests',
      },
    };

    __mockClient.responses.create.mockRejectedValueOnce(error);

    expect.assertions(3);

    try {
      await postGenerationService.probeOpenAIResponse({ ownerKey, newsId: article.id });
      throw new Error('Expected probeOpenAIResponse to reject');
    } catch (caughtError) {
      expect(caughtError).toBeInstanceOf(postGenerationService.OpenAIResponseError);
      expect(caughtError.status).toBe(429);
      expect(caughtError.payloadBruto).toEqual(error.payload);
    }
  });
});
