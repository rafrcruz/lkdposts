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
const allowlistService = require('../src/services/allowlist.service');
const { prisma } = require('../src/lib/prisma');

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

describe('Allowlist API', () => {
  beforeEach(async () => {
    prisma.__reset();

    authService.validateSessionToken.mockImplementation(async ({ token }) => {
      if (token === TOKENS.admin) {
        return sessionForUser(1, 'admin@example.com', 'admin');
      }

      if (token === TOKENS.user) {
        return sessionForUser(2, 'user@example.com', 'user');
      }

      return null;
    });

    await allowlistService.createAllowedUser({ email: 'admin@example.com', role: 'admin' });
    await allowlistService.createAllowedUser({ email: 'beta@example.com', role: 'user' });
    await allowlistService.createAllowedUser({ email: 'gamma@example.com', role: 'user' });
    await allowlistService.createAllowedUser({ email: 'delta@example.com', role: 'user' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/allowlist', () => {
    it('returns paginated allowlist entries with metadata for admins', async () => {
      const firstPage = await withAuth(TOKENS.admin, request(app).get('/api/v1/allowlist'))
        .query({ limit: 2 })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(firstPage.body.data.items).toHaveLength(2);
      expect(firstPage.body.meta).toEqual(
        expect.objectContaining({
          total: 4,
          limit: 2,
          nextCursor: expect.any(Number),
        })
      );

      const nextCursor = firstPage.body.meta.nextCursor;

      const secondPage = await withAuth(TOKENS.admin, request(app).get('/api/v1/allowlist'))
        .query({ cursor: nextCursor })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(secondPage.body.data.items).toHaveLength(2);
      expect(secondPage.body.meta.nextCursor).toBeNull();
    });

    it('rejects non-admin users with forbidden error', async () => {
      const response = await withAuth(TOKENS.user, request(app).get('/api/v1/allowlist'))
        .expect('Content-Type', /json/)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
