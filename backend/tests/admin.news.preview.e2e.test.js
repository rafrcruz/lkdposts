const request = require('supertest');
const { createHash } = require('node:crypto');

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
const { MAX_GENERATION_ATTEMPTS } = require('../src/services/post-generation.service');

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  admin: 'token-admin',
  user: 'token-user',
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

describe('Admin news preview API', () => {
  let adminUser;
  let regularUser;

  beforeEach(async () => {
    prisma.__reset();

    authService.validateSessionToken.mockImplementation(async ({ token }) => {
      if (token === TOKENS.admin) {
        return sessionForUser(adminUser.id, adminUser.email, 'admin');
      }

      if (token === TOKENS.user) {
        return sessionForUser(regularUser.id, regularUser.email, 'user');
      }

      return null;
    });

    adminUser = await prisma.allowedUser.create({ data: { email: 'admin@example.com', role: 'admin' } });
    regularUser = await prisma.allowedUser.create({ data: { email: 'user@example.com', role: 'user' } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createPrompt = async ({ userId, title, content, position, enabled = true }) =>
    prisma.prompt.create({ data: { userId, title, content, position, enabled } });

  const createFeed = async ({ ownerKey, title = 'Feed', url = 'https://example.com/feed.xml' }) =>
    prisma.feed.create({ data: { ownerKey, title, url } });

  const createArticle = async ({
    feedId,
    title,
    contentSnippet = 'Resumo',
    articleHtml = '<p>Conteúdo</p>',
    publishedAt,
    link,
    guid,
    dedupeKey,
  }) =>
    prisma.article.create({
      data: {
        feedId,
        title,
        contentSnippet,
        articleHtml,
        publishedAt,
        link: link ?? `https://example.com/news-${dedupeKey}`,
        guid: guid ?? `guid-${dedupeKey}`,
        dedupeKey,
      },
    });

  it('returns preview for the first eligible article when news_id is omitted', async () => {
    const ownerKey = String(adminUser.id);
    const now = Date.now();
    await createPrompt({ userId: adminUser.id, title: 'Primeiro prompt', content: 'Conteúdo A', position: 0, enabled: true });
    await createPrompt({ userId: adminUser.id, title: 'Inativo', content: 'Ignorado', position: 1, enabled: false });

    const feed = await createFeed({ ownerKey, title: 'Feed Principal' });

    const olderArticle = await createArticle({
      feedId: feed.id,
      title: 'Notícia antiga',
      publishedAt: new Date(now - 2 * 60 * 60 * 1000),
      guid: 'guid-older',
      dedupeKey: 'dedupe-older',
    });

    await createArticle({
      feedId: feed.id,
      title: 'Notícia mais recente',
      publishedAt: new Date(now - 60 * 60 * 1000),
      guid: 'guid-newer',
      dedupeKey: 'dedupe-newer',
    });

    const response = await withAuth(TOKENS.admin, request(app).get('/api/v1/admin/news/preview-payload'))
      .expect('Content-Type', /json/)
      .expect(200);

    const { data } = response.body;
    expect(data.prompt_base).toContain('Primeiro prompt');
    expect(data.prompt_base).not.toContain('Inativo');
    expect(data.prompt_base_hash).toBe(createHash('sha256').update(data.prompt_base).digest('hex'));
    expect(data.model).toBe('gpt-5-nano');
    expect(data.news_payload).not.toBeNull();
    expect(data.news_payload.article.id).toBe(olderArticle.id);
    expect(data.news_payload.message.content[0].text).toContain(`Notícia ID interno: ${olderArticle.id}`);
  });

  it('returns preview for the requested news_id', async () => {
    const ownerKey = String(adminUser.id);
    const now = Date.now();
    await createPrompt({ userId: adminUser.id, title: 'Prompt único', content: 'Conteúdo base', position: 0 });
    const feed = await createFeed({ ownerKey });

    const firstArticle = await createArticle({
      feedId: feed.id,
      title: 'Primeira notícia',
      publishedAt: new Date(now - 4 * 60 * 60 * 1000),
      guid: 'guid-first',
      dedupeKey: 'dedupe-first',
    });

    const targetArticle = await createArticle({
      feedId: feed.id,
      title: 'Segunda notícia',
      publishedAt: new Date(now - 2 * 60 * 60 * 1000),
      guid: 'guid-second',
      dedupeKey: 'dedupe-second',
    });

    const response = await withAuth(
      TOKENS.admin,
      request(app).get('/api/v1/admin/news/preview-payload').query({ news_id: targetArticle.id }),
    )
      .expect('Content-Type', /json/)
      .expect(200);

    const { data } = response.body;
    expect(data.news_payload.article.id).toBe(targetArticle.id);
    expect(data.news_payload.message.content[0].text).toContain(targetArticle.title);
    expect(data.news_payload.message.content[0].text).not.toContain(firstArticle.title);
  });

  it('returns null payload when there are no eligible articles', async () => {
    const ownerKey = String(adminUser.id);
    const now = Date.now();
    await createPrompt({ userId: adminUser.id, title: 'Prompt único', content: 'Conteúdo base', position: 0 });
    const feed = await createFeed({ ownerKey });

    const processedArticle = await createArticle({
      feedId: feed.id,
      title: 'Processada',
      publishedAt: new Date(now - 3 * 60 * 60 * 1000),
      guid: 'guid-processed',
      dedupeKey: 'dedupe-processed',
    });

    await prisma.post.create({
      data: {
        articleId: processedArticle.id,
        status: 'SUCCESS',
        attemptCount: MAX_GENERATION_ATTEMPTS,
      },
    });

    const response = await withAuth(TOKENS.admin, request(app).get('/api/v1/admin/news/preview-payload'))
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.data.news_payload).toBeNull();
  });

  it('returns 404 when the requested news_id does not exist', async () => {
    await createPrompt({ userId: adminUser.id, title: 'Prompt', content: 'Conteúdo', position: 0 });
    await createFeed({ ownerKey: String(adminUser.id) });

    const response = await withAuth(
      TOKENS.admin,
      request(app).get('/api/v1/admin/news/preview-payload').query({ news_id: 999 }),
    )
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body.error.code).toBe('NEWS_NOT_FOUND');
  });

  it('returns forbidden for non-admin users', async () => {
    await createPrompt({ userId: adminUser.id, title: 'Prompt', content: 'Conteúdo', position: 0 });
    await createFeed({ ownerKey: String(adminUser.id) });

    const response = await withAuth(TOKENS.user, request(app).get('/api/v1/admin/news/preview-payload'))
      .expect('Content-Type', /json/)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns unauthorized when missing credentials', async () => {
    const response = await request(app).get('/api/v1/admin/news/preview-payload')
      .set('Origin', ORIGIN)
      .expect('Content-Type', /json/)
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
