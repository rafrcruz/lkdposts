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
const feedService = require('../src/services/feed.service');
const { prisma } = require('../src/lib/prisma');

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

describe('Feeds API', () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/feeds', () => {
    it('returns only feeds owned by the authenticated user with pagination metadata', async () => {
      await feedService.createFeed({ ownerKey: '1', url: 'https://example.com/feed-1.xml', title: 'Feed 1' });
      await feedService.createFeed({ ownerKey: '1', url: 'https://example.com/feed-2.xml', title: 'Feed 2' });
      await feedService.createFeed({ ownerKey: '1', url: 'https://example.com/feed-3.xml', title: 'Feed 3' });
      await feedService.createFeed({ ownerKey: '2', url: 'https://others.com/feed.xml', title: 'Other' });

      const firstPage = await withAuth(TOKENS.user1, request(app).get('/api/v1/feeds'))
        .query({ limit: 2 })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(firstPage.body.data.items).toHaveLength(2);
      expect(firstPage.body.data.items.map((item) => item.url)).toEqual([
        'https://example.com/feed-1.xml',
        'https://example.com/feed-2.xml',
      ]);
      expect(firstPage.body.meta).toEqual(
        expect.objectContaining({
          nextCursor: expect.any(String),
          total: 3,
          limit: 2,
        })
      );

      const nextCursor = firstPage.body.meta.nextCursor;

      const secondPage = await withAuth(TOKENS.user1, request(app).get('/api/v1/feeds'))
        .query({ cursor: nextCursor })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.data.items[0]).toEqual(
        expect.objectContaining({ url: 'https://example.com/feed-3.xml', title: 'Feed 3' })
      );
      expect(secondPage.body.meta.nextCursor).toBeNull();
    });
  });

  describe('POST /api/v1/feeds', () => {
    it('creates a feed when a valid URL is provided', async () => {
      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/feeds'))
        .send({ url: ' https://news.example.com/rss ', title: '  News  ' })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          url: 'https://news.example.com/rss',
          title: 'News',
          lastFetchedAt: null,
        })
      );
    });

    it('rejects duplicate feeds for the same user', async () => {
      await feedService.createFeed({ ownerKey: '1', url: 'https://duplicate.example.com/rss' });

      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/feeds'))
        .send({ url: 'https://duplicate.example.com/rss' })
        .expect('Content-Type', /json/)
        .expect(409);

      expect(response.body.error.code).toBe('FEED_ALREADY_EXISTS');
    });

    it('rejects invalid URLs', async () => {
      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/feeds'))
        .send({ url: 'invalid-url' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_URL');
    });
  });

  describe('POST /api/v1/feeds/bulk', () => {
    it('classifies created, duplicate and invalid URLs correctly', async () => {
      await feedService.createFeed({ ownerKey: '1', url: 'https://existing.example.com/rss' });

      const response = await withAuth(TOKENS.user1, request(app).post('/api/v1/feeds/bulk'))
        .send({
          urls: [
            '   ',
            'https://existing.example.com/rss',
            'https://bulk.example.com/a',
            'https://bulk.example.com/a',
            'ftp://invalid.example.com/rss',
            'https://bulk.example.com/b',
            'not-a-url',
          ],
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data.created).toHaveLength(2);
      expect(response.body.data.created.map((feed) => feed.url)).toEqual([
        'https://bulk.example.com/a',
        'https://bulk.example.com/b',
      ]);

      expect(response.body.data.duplicates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://existing.example.com/rss', reason: 'ALREADY_EXISTS' }),
          expect.objectContaining({ url: 'https://bulk.example.com/a', reason: 'DUPLICATE_IN_PAYLOAD' }),
        ])
      );

      expect(response.body.data.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reason: 'URL_REQUIRED' }),
          expect.objectContaining({ url: 'ftp://invalid.example.com/rss', reason: 'INVALID_URL' }),
          expect.objectContaining({ url: 'not-a-url', reason: 'INVALID_URL' }),
        ])
      );
    });
  });

  describe('PATCH /api/v1/feeds/:id', () => {
    it('updates the title of an existing feed', async () => {
      const feed = await feedService.createFeed({ ownerKey: '1', url: 'https://update.example.com/rss', title: 'Old' });

      const response = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/feeds/${feed.id}`))
        .send({ title: 'New Title' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: feed.id,
          title: 'New Title',
          url: 'https://update.example.com/rss',
        })
      );
    });

    it('rejects updates that would duplicate another feed URL', async () => {
      const original = await feedService.createFeed({ ownerKey: '1', url: 'https://keep.example.com/rss' });
      const target = await feedService.createFeed({ ownerKey: '1', url: 'https://change.example.com/rss' });

      const response = await withAuth(TOKENS.user1, request(app).patch(`/api/v1/feeds/${target.id}`))
        .send({ url: original.url })
        .expect('Content-Type', /json/)
        .expect(409);

      expect(response.body.error.code).toBe('FEED_ALREADY_EXISTS');
    });

    it('returns 404 when editing a feed owned by another user', async () => {
      const foreignFeed = await feedService.createFeed({ ownerKey: '2', url: 'https://foreign.example.com/rss' });

      await withAuth(TOKENS.user1, request(app).patch(`/api/v1/feeds/${foreignFeed.id}`))
        .send({ title: 'Unauthorized' })
        .expect('Content-Type', /json/)
        .expect(404);
    });
  });

  describe('DELETE /api/v1/feeds/:id', () => {
    it('removes a feed owned by the authenticated user', async () => {
      const feed = await feedService.createFeed({ ownerKey: '1', url: 'https://delete.example.com/rss' });

      await withAuth(TOKENS.user1, request(app).delete(`/api/v1/feeds/${feed.id}`))
        .expect('Content-Type', /json/)
        .expect(200);

      const list = await feedService.listFeeds({ ownerKey: '1', limit: 10 });
      expect(list.items).toHaveLength(0);
    });

    it('returns 404 when deleting a feed owned by another user', async () => {
      const foreignFeed = await feedService.createFeed({ ownerKey: '2', url: 'https://other.example.com/rss' });

      await withAuth(TOKENS.user1, request(app).delete(`/api/v1/feeds/${foreignFeed.id}`))
        .expect('Content-Type', /json/)
        .expect(404);
    });
  });
});
