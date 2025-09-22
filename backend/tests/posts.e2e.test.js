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

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  user1: 'token-user-1',
  user2: 'token-user-2',
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

      return null;
    });

    originalFetch = globalThis.fetch;
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
    it('refreshes feeds, creates new articles and posts, and returns a summary', async () => {
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
      expect(posts[0].content).toBe(postsService.POST_PLACEHOLDER_CONTENT);

      const updatedFeed = await prisma.feed.findUnique({ where: { id: feed.id } });
      expect(updatedFeed.lastFetchedAt).not.toBeNull();
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
          post: expect.objectContaining({ content: postsService.POST_PLACEHOLDER_CONTENT }),
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
});
