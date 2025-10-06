const { createHash } = require('node:crypto');

jest.mock('../src/services/auth.service', () => {
  const actual = jest.requireActual('../src/services/auth.service');
  return {
    ...actual,
    validateSessionToken: jest.fn(),
  };
});

const request = require('supertest');

const app = require('../src/app');
const authService = require('../src/services/auth.service');
const { prisma } = require('../src/lib/prisma');
const postsService = require('../src/services/posts.service');
const postGenerationService = require('../src/services/post-generation.service');
const ingestionDiagnostics = require('../src/services/ingestion-diagnostics');
const { __mockClient } = require('../src/lib/openai-client');

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  user1: 'token-user-1',
  user2: 'token-user-2',
  admin: 'token-admin',
};

const sessionForUser = (userId, email) => ({
  session: {
    id: `session-${userId}`,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: userId,
      email,
      role: 'user',
    },
  },
  renewed: false,
});

const sessionForAdmin = (userId, email) => ({
  session: {
    id: `session-admin-${userId}`,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: userId,
      email,
      role: 'admin',
    },
  },
  renewed: false,
});

const withAuth = (token, req) => req.set('Origin', ORIGIN).set('Authorization', `Bearer ${token}`);

const createFetchResponse = (body, { ok = true, status } = {}) => ({
  ok,
  status: status ?? (ok ? 200 : 500),
  text: jest.fn().mockResolvedValue(body),
});

const createFetchMock = (body) => jest.fn().mockResolvedValue(createFetchResponse(body));

function delay(ms) {
  return new Promise(function executor(resolve) {
    setTimeout(resolve, ms);
  });
}

const createDelayedFetchMock = (body, delayMs = 20) => {
  const response = createFetchResponse(body);

  async function delayedFetch() {
    await delay(delayMs);
    return response;
  }

  return jest.fn(delayedFetch);
};

describe('Posts API', () => {
  let originalFetch;

  beforeEach(() => {
    prisma.__reset();

    authService.validateSessionToken.mockImplementation(async ({ token }) => {
      if (token === TOKENS.user1) {
        return sessionForUser(1, 'user1@example.com');
      }

      if (token === TOKENS.user2) {
        return sessionForUser(2, 'user2@example.com');
      }

      if (token === TOKENS.admin) {
        return sessionForAdmin(99, 'admin@example.com');
      }

      return null;
    });

    originalFetch = globalThis.fetch;
    ingestionDiagnostics.reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  describe('POST /api/v1/posts/refresh', () => {
    it('refreshes feeds, creates new articles and placeholders, and returns a summary', async () => {
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/feed.xml',
          lastFetchedAt: new Date('2025-02-01T00:00:00Z'),
        },
      });

      const publishedAt = new Date(Date.now() - 60 * 1000);
      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Story</title><description>Snippet</description><pubDate>${publishedAt.toUTCString()}</pubDate><guid>guid-1</guid></item></channel></rss>`;

      globalThis.fetch = createFetchMock(rss);

      const response = await withAuth(
        TOKENS.user1,
        request(app).post('/api/v1/posts/refresh')
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(globalThis.fetch).toHaveBeenCalledWith(feed.url, expect.any(Object));
      expect(response.body.data.feeds).toHaveLength(1);
      expect(response.body.data.feeds[0]).toEqual(
        expect.objectContaining({
          feedId: feed.id,
          articlesCreated: 1,
          itemsWithinWindow: 1,
          error: null,
        })
      );

      const articles = await prisma.article.findMany();
      const posts = await prisma.post.findMany();
      expect(articles).toHaveLength(1);
      expect(posts).toHaveLength(1);
      expect(posts[0].status).toBe('PENDING');
      expect(posts[0].content).toBeNull();
      expect(posts[0].attemptCount).toBe(0);
      expect(posts[0].modelUsed).toBeNull();
      expect(posts[0].generatedAt).toBeNull();
      expect(posts[0].tokensInput).toBeNull();
      expect(posts[0].tokensOutput).toBeNull();
      expect(posts[0].promptBaseHash).toBeNull();

      const updatedFeed = await prisma.feed.findUnique({ where: { id: feed.id } });
      expect(updatedFeed.lastFetchedAt).not.toBeNull();
    });

    it('stores generated text from structured responses after manual generation and exposes it in the list endpoint', async () => {
      await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/structured.xml',
          lastFetchedAt: null,
        },
      });

      const publishedAt = new Date(Date.now() - 5 * 60 * 1000);
      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Structured Story</title><description>Snippet</description><pubDate>${publishedAt.toUTCString()}</pubDate><guid>structured-guid</guid></item></channel></rss>`;

      globalThis.fetch = createFetchMock(rss);

      __mockClient.responses.create.mockImplementationOnce(async () => ({
        id: 'resp-structured-e2e',
        model: 'gpt-5-nano',
        output: [
          {
            content: [
              { type: 'text', text: 'Parágrafo um.' },
              { type: 'output_text', text: 'Parágrafo dois.' },
            ],
          },
        ],
        usage: { input_tokens: 160, output_tokens: 120 },
      }));

      const refreshResponse = await withAuth(TOKENS.user1, request(app).post('/api/v1/posts/refresh'))
        .expect('Content-Type', /json/)
        .expect(200);

      const articleRecord = await prisma.article.findFirst({ where: { feed: { ownerKey: '1' } } });
      expect(articleRecord).not.toBeNull();
      if (!articleRecord) {
        throw new Error('Article was not created during refresh');
      }

      await withAuth(
        TOKENS.user1,
        request(app).post(`/api/v1/posts/${articleRecord.id}/generate`),
      )
        .expect('Content-Type', /json/)
        .expect(200);

      const listResponse = await withAuth(TOKENS.user1, request(app).get('/api/v1/posts'))
        .expect('Content-Type', /json/)
        .expect(200);

      const [item] = listResponse.body.data.items;
      expect(item.post).toEqual(
        expect.objectContaining({
          content: 'Parágrafo um.\n\nParágrafo dois.',
        }),
      );
    });

    it('applies a custom prompt when manually generating a post', async () => {
      await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/custom-manual.xml',
          lastFetchedAt: null,
        },
      });

      const publishedAt = new Date(Date.now() - 2 * 60 * 1000);
      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Custom Manual Story</title><description>Snippet manual custom</description><pubDate>${publishedAt.toUTCString()}</pubDate><guid>custom-manual-guid</guid></item></channel></rss>`;

      globalThis.fetch = createFetchMock(rss);

      const customPrompt = '  Direcione o post para executivos de tecnologia.\nUse bullet points.  ';
      let capturedPayload = null;

      __mockClient.responses.create.mockImplementationOnce(async (payload) => {
        capturedPayload = payload;
        return {
          id: 'resp-custom-manual',
          model: 'gpt-5-nano',
          output: [
            {
              content: [{ type: 'output_text', text: 'Post gerado com instruções personalizadas.' }],
            },
          ],
          usage: { input_tokens: 180, output_tokens: 90 },
        };
      });

      await withAuth(TOKENS.user1, request(app).post('/api/v1/posts/refresh'))
        .expect('Content-Type', /json/)
        .expect(200);

      const articleRecord = await prisma.article.findFirst({ where: { feed: { ownerKey: '1' } } });
      expect(articleRecord).not.toBeNull();
      if (!articleRecord) {
        throw new Error('Article was not created during refresh');
      }

      await withAuth(
        TOKENS.user1,
        request(app)
          .post(`/api/v1/posts/${articleRecord.id}/generate`)
          .send({ customPrompt }),
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(capturedPayload).not.toBeNull();
      const systemContent = capturedPayload?.input?.[0]?.content?.[0]?.text ?? '';
      expect(systemContent).toContain('Direcione o post para executivos de tecnologia.');
      expect(systemContent).toContain('Use bullet points.');
      expect(systemContent.endsWith('Instrução final: gerar um post para LinkedIn com base na notícia e no contexto acima.')).toBe(
        true,
      );
      const systemSegments = systemContent.split('\n\n');
      expect(systemSegments[0]).toBe('Direcione o post para executivos de tecnologia.\nUse bullet points.');
      expect(systemSegments[1]).toBe('Instrução final: gerar um post para LinkedIn com base na notícia e no contexto acima.');

      const userContent = capturedPayload?.input?.[1]?.content?.[0]?.text ?? '';
      expect(userContent).toContain('Notícia ID interno');

      const postRecord = await prisma.post.findUnique({ where: { articleId: articleRecord.id } });
      expect(postRecord).not.toBeNull();
      if (!postRecord) {
        throw new Error('Post was not updated after manual generation');
      }

      const expectedSystemPrompt = 'Direcione o post para executivos de tecnologia.\nUse bullet points.\n\nInstrução final: gerar um post para LinkedIn com base na notícia e no contexto acima.';
      const expectedHash = createHash('sha256').update(expectedSystemPrompt).digest('hex');
      expect(postRecord.promptBaseHash).toBe(expectedHash);
    });

    it('reuses a single refresh when the same user triggers concurrent requests', async () => {
      await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/concurrent.xml',
          lastFetchedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
      });

      const publishedAt = new Date(Date.now() - 2 * 60 * 1000);
      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>Concurrent Story</title><description>Snippet</description><pubDate>${publishedAt.toUTCString()}</pubDate><guid>guid-concurrent</guid></item></channel></rss>`;

      globalThis.fetch = createDelayedFetchMock(rss);

      const requestA = withAuth(TOKENS.user1, request(app).post('/api/v1/posts/refresh')).expect('Content-Type', /json/);
      const requestB = withAuth(TOKENS.user1, request(app).post('/api/v1/posts/refresh')).expect('Content-Type', /json/);

      const promiseA = requestA.expect(200);
      const promiseB = requestB.expect(200);

      const [responseA, responseB] = await Promise.all([promiseA, promiseB]);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(responseA.body.data).toEqual(responseB.body.data);
      expect(responseA.body.data.feeds[0].articlesCreated).toBe(1);
      const articles = await prisma.article.findMany();
      expect(articles).toHaveLength(1);
    });
  });

  describe('POST /api/v1/posts/:articleId/generate', () => {
    it('generates a post on demand and returns the updated article', async () => {
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/manual-generate.xml',
        },
      });

      const article = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Manual story',
          contentSnippet: 'Snippet manual',
          publishedAt: new Date(),
          guid: 'manual-guid',
          link: 'https://example.com/manual',
          dedupeKey: 'guid:manual-guid',
        },
      });

      await prisma.post.create({ data: { articleId: article.id } });

      __mockClient.responses.create.mockImplementationOnce(async () => ({
        id: 'resp-manual-e2e',
        model: 'gpt-5-nano',
        output: [
          {
            content: [
              { type: 'text', text: 'Primeiro parágrafo.' },
              { type: 'output_text', text: 'Segundo parágrafo.' },
            ],
          },
        ],
        usage: { input_tokens: 90, output_tokens: 60 },
      }));

      const response = await withAuth(
        TOKENS.user1,
        request(app).post(`/api/v1/posts/${article.id}/generate`),
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.item.post).toEqual(
        expect.objectContaining({
          content: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
          status: 'SUCCESS',
        }),
      );

      const storedPost = await prisma.post.findUnique({ where: { articleId: article.id } });
      expect(storedPost.status).toBe('SUCCESS');
      expect(storedPost.content).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.');
      expect(storedPost.attemptCount).toBe(1);
      expect(storedPost.modelUsed).toBe('gpt-5-nano');
    });

    it('returns an error when the article reached the generation attempt limit', async () => {
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/manual-limit.xml',
        },
      });

      const article = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Manual limit story',
          contentSnippet: 'Snippet limit',
          publishedAt: new Date(),
          guid: 'manual-limit-guid',
          link: null,
          dedupeKey: 'guid:manual-limit',
        },
      });

      await prisma.post.create({
        data: {
          articleId: article.id,
          status: 'FAILED',
          attemptCount: postGenerationService.MAX_GENERATION_ATTEMPTS,
        },
      });

      await withAuth(
        TOKENS.user1,
        request(app).post(`/api/v1/posts/${article.id}/generate`),
      )
        .expect('Content-Type', /json/)
        .expect(409);
    });
  });

  describe('POST /api/v1/posts/cleanup', () => {
    it('removes old articles and their posts for the authenticated user', async () => {
      const now = new Date();
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/cleanup.xml',
        },
      });

      const staleArticle = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Old',
          contentSnippet: 'Old snippet',
          publishedAt: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000),
          guid: 'old-guid',
          link: null,
          dedupeKey: 'guid:old-guid',
        },
      });
      await prisma.post.create({ data: { articleId: staleArticle.id, content: 'Old post' } });

      const recentArticle = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Recent',
          contentSnippet: 'Recent snippet',
          publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          guid: 'recent-guid',
          link: null,
          dedupeKey: 'guid:recent-guid',
        },
      });
      await prisma.post.create({ data: { articleId: recentArticle.id, content: 'Recent post' } });

      const response = await withAuth(
        TOKENS.user1,
        request(app).post('/api/v1/posts/cleanup')
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data).toEqual({ removedArticles: 1, removedPosts: 1 });

      const remainingArticles = await prisma.article.findMany();
      expect(remainingArticles).toHaveLength(1);
      expect(remainingArticles[0].title).toBe('Recent');
    });
  });

  describe('GET /api/v1/posts', () => {
    it('lists recent posts with pagination metadata and includes post content', async () => {
      const now = new Date();
      await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/list.xml',
        },
      });

      const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${[0, 1, 2]
        .map((daysAgo) => {
          const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
          return `<item><title>Item ${daysAgo}</title><description>Snippet ${daysAgo}</description><pubDate>${date.toUTCString()}</pubDate><guid>guid-${daysAgo}</guid></item>`;
        })
        .join('')}</channel></rss>`;

      globalThis.fetch = createFetchMock(rss);

      await postsService.refreshUserFeeds({ ownerKey: '1', now, fetcher: globalThis.fetch });

      const firstPage = await withAuth(
        TOKENS.user1,
        request(app).get('/api/v1/posts').query({ limit: 2 })
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(firstPage.body.data.items).toHaveLength(2);
      expect(firstPage.body.data.items[0]).toEqual(
        expect.objectContaining({
          title: 'Item 0',
          post: expect.objectContaining({ status: 'PENDING', content: null, attemptCount: 0 }),
        })
      );
      const cursor = firstPage.body.meta.nextCursor;
      expect(cursor).not.toBeNull();

      const secondPage = await withAuth(
        TOKENS.user1,
        request(app).get('/api/v1/posts').query({ cursor })
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.meta.nextCursor).toBeNull();
    });

    it('returns stored article HTML as noticia with diagnostics in non-production environments', async () => {
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/manual.xml',
          title: 'Manual Feed',
        },
      });

      const articleHtml = '<p><strong>Breaking</strong> news content.</p>';
      const publishedAt = new Date();
      const article = await prisma.article.create({
        data: {
          feedId: feed.id,
          title: 'Breaking news',
          contentSnippet: 'Breaking news content.',
          articleHtml,
          publishedAt,
          guid: 'manual-guid',
          link: 'https://example.com/posts/breaking',
          dedupeKey: 'guid:manual-guid',
        },
      });
      await prisma.post.create({ data: { articleId: article.id, content: 'post content' } });

      const response = await withAuth(TOKENS.user1, request(app).get('/api/v1/posts'))
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.items).toHaveLength(1);
      const [item] = response.body.data.items;
      expect(item.noticia).toBe(articleHtml);
      expect(item.articleHtml).toBe(articleHtml);
      expect(item.noticia).not.toMatch(/&lt;p&gt;/);
      expect(item.link).toBe('https://example.com/posts/breaking');
      expect(item.noticiaPreviewLength).toBe(articleHtml.length);
      expect(item.hasBlockTags).toBe(true);
    });

    it('caps the requested limit to the maximum allowed page size', async () => {
      const now = new Date();
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/limit.xml',
        },
      });

      const total = postsService.constants.MAX_PAGE_SIZE + 7;
      for (let index = 0; index < total; index += 1) {
        const article = await prisma.article.create({
          data: {
            feedId: feed.id,
            title: `Article ${index}`,
            contentSnippet: `Snippet ${index}`,
            publishedAt: new Date(now.getTime() - index * 60 * 1000),
            guid: `guid-${index}`,
            link: null,
            dedupeKey: `guid:guid-${index}`,
          },
        });
        await prisma.post.create({ data: { articleId: article.id, content: `Content ${index}` } });
      }

      const response = await withAuth(
        TOKENS.user1,
        request(app).get('/api/v1/posts').query({ limit: postsService.constants.MAX_PAGE_SIZE + 99 })
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.items).toHaveLength(postsService.constants.MAX_PAGE_SIZE);
      expect(response.body.meta.limit).toBe(postsService.constants.MAX_PAGE_SIZE);
    });
  });

  describe('GET /api/v1/diagnostics/ingestion', () => {
    it('rejects non-admin users', async () => {
      await withAuth(TOKENS.user1, request(app).get('/api/v1/diagnostics/ingestion'))
        .expect('Content-Type', /json/)
        .expect(403);
    });

    it('returns recent ingestion diagnostics for admins', async () => {
      const feed = await prisma.feed.create({
        data: {
          ownerKey: '1',
          url: 'https://example.com/diagnostics.xml',
          title: 'Diagnostics Feed',
        },
      });

      const longBody = `<p>${'Diagnostics paragraph '.repeat(25)}</p>`;
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
          <channel>
            <title>Diagnostics Feed</title>
            <item>
              <title>Diagnostics Story</title>
              <link>https://source.example.com/story</link>
              <description><![CDATA[Plain summary]]></description>
              <content:encoded><![CDATA[${longBody}]]></content:encoded>
              <pubDate>Mon, 10 Mar 2025 09:00:00 +0000</pubDate>
              <guid>diagnostics-guid</guid>
            </item>
          </channel>
        </rss>`;

      globalThis.fetch = createFetchMock(rss);
      await postsService.refreshUserFeeds({ ownerKey: '1', now: new Date('2025-03-10T10:00:00Z'), fetcher: globalThis.fetch });

      const response = await withAuth(
        TOKENS.admin,
        request(app).get('/api/v1/diagnostics/ingestion').query({ feedId: feed.id, limit: 5 })
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.items).toHaveLength(1);
      const [entry] = response.body.data.items;
      expect(entry.itemId).toBeGreaterThan(0);
      expect(entry.feedId).toBe(feed.id);
      expect(entry.feedTitle).toBe('Diagnostics Feed');
      expect(entry.itemTitle).toBe('Diagnostics Story');
      expect(entry.canonicalUrl).toBe('https://source.example.com/story');
      expect(entry.articleHtmlLength).toBeGreaterThan(entry.rawDescriptionLength);
      expect(entry.hasBlockTags).toBe(true);
      expect(entry.looksEscapedHtml).toBe(false);
      expect(entry.articleHtmlPreview.length).toBeLessThanOrEqual(300);
      expect(entry.weakContent).toBe(false);
      expect(entry.chosenSource).toBe('contentEncoded');
    });
  });
});
