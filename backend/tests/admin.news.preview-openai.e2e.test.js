const request = require('supertest');

jest.mock('../src/services/auth.service', () => {
  const actual = jest.requireActual('../src/services/auth.service');
  return {
    ...actual,
    validateSessionToken: jest.fn(),
  };
});

const app = require('../src/app');
const authService = require('../src/services/auth.service');
const { prisma } = require('../src/lib/prisma');
const { __mockClient } = require('../src/lib/openai-client');

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  admin: 'token-admin',
  other: 'token-other',
};

const sessionForUser = (userId, email, role) => ({
  session: {
    id: `session-${userId}`,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: userId,
      email,
      role,
    },
  },
  renewed: false,
});

const withAuth = (token, req) => req.set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`);

const createPrompt = ({ userId, title, content, position, enabled = true }) =>
  prisma.prompt.create({ data: { userId, title, content, position, enabled } });

const createFeed = ({ ownerKey, title = 'Feed principal', url = 'https://example.com/feed.xml' }) =>
  prisma.feed.create({ data: { ownerKey, title, url } });

const createArticle = ({
  feedId,
  title,
  contentSnippet = 'Resumo',
  articleHtml = '<p>Conteúdo</p>',
  publishedAt = new Date('2024-01-02T09:00:00.000Z'),
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

describe('GET /api/v1/admin/news/preview-openai', () => {
  let adminUser;

  beforeEach(async () => {
    prisma.__reset();

    __mockClient.responses.create.mockReset();
    __mockClient.withOptions.mockClear();

    adminUser = await prisma.allowedUser.create({ data: { email: 'admin@example.com', role: 'admin' } });

    authService.validateSessionToken.mockImplementation(async ({ token }) => {
      if (token === TOKENS.admin) {
        return sessionForUser(adminUser.id, adminUser.email, 'admin');
      }

      if (token === TOKENS.other) {
        return sessionForUser(999, 'user@example.com', 'user');
      }

      return null;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the raw OpenAI response without envelope on success', async () => {
    const ownerKey = String(adminUser.id);
    await createPrompt({ userId: adminUser.id, title: 'Prompt base', content: 'Contexto', position: 0 });
    const feed = await createFeed({ ownerKey });
    const article = await createArticle({ feedId: feed.id, title: 'Notícia destacada' });

    const rawOpenAIResponse = {
      id: 'resp_456',
      model: 'gpt-5-nano',
      usage: { input_tokens: 100, output_tokens: 40 },
      output: [
        {
          id: 'choice-1',
          type: 'message',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Prévia gerada para a notícia',
              },
            ],
          },
        },
      ],
    };

    __mockClient.responses.create.mockResolvedValueOnce(rawOpenAIResponse);

    const response = await withAuth(
      TOKENS.admin,
      request(app).get('/api/v1/admin/news/preview-openai').query({ news_id: article.id }),
    )
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual(rawOpenAIResponse);
    expect(response.body).not.toHaveProperty('success');
    expect(__mockClient.responses.create).toHaveBeenCalledTimes(1);
  });

  it('bubbles up OpenAI error status and payload', async () => {
    const ownerKey = String(adminUser.id);
    await createPrompt({ userId: adminUser.id, title: 'Prompt base', content: 'Contexto', position: 0 });
    const feed = await createFeed({ ownerKey });
    const article = await createArticle({ feedId: feed.id, title: 'Notícia com erro' });

    const error = new Error('OpenAI request failed with status 500');
    error.status = 500;
    error.payload = {
      error: {
        type: 'server_error',
        code: 'internal',
        message: 'Internal server error',
      },
    };

    __mockClient.responses.create.mockRejectedValueOnce(error);

    const response = await withAuth(
      TOKENS.admin,
      request(app).get('/api/v1/admin/news/preview-openai').query({ news_id: article.id }),
    )
      .expect('Content-Type', /json/)
      .expect(500);

    expect(response.body).toEqual(error.payload);
  });
});
