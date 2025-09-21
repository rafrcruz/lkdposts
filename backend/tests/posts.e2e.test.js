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

    originalFetch = global.fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
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

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => rss,
      }));

      const response = await withAuth(
        TOKENS.user1,
        request(app).post('/api/v1/posts/refresh')
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(global.fetch).toHaveBeenCalledWith(feed.url, expect.any(Object));
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
      const feed = await prisma.feed.create({
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

      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => rss,
      }));

      await postsService.refreshUserFeeds({ ownerKey: '1', now, fetcher: global.fetch });

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
  });
});
