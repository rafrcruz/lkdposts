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
const appParamsService = require('../src/services/app-params.service');
const { prisma } = require('../src/lib/prisma');

const ORIGIN = 'http://localhost:5173';
const TOKENS = {
  admin: 'token-admin',
  user: 'token-user',
};
const SUPPORTED_MODELS = appParamsService.OPENAI_MODEL_OPTIONS;

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

describe('Application parameters API', () => {
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

    await appParamsService.ensureDefaultAppParams();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns seeded values for authenticated users', async () => {
    const response = await withAuth(TOKENS.user, request(app).get('/api/v1/app-params')).expect('Content-Type', /json/).expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        posts_refresh_cooldown_seconds: 3600,
        posts_time_window_days: 7,
        'openai.model': 'gpt-5-nano',
      })
    );
    expect(typeof response.body.data.updated_at).toBe('string');
    expect(response.body.data).not.toHaveProperty('updated_by');
  });

  it('allows admins to update parameters and records audit info', async () => {
    const initial = await appParamsService.getAppParams();

    const response = await withAuth(
      TOKENS.admin,
      request(app)
        .put('/api/v1/app-params')
        .send({ posts_refresh_cooldown_seconds: 1800, 'openai.model': 'gpt-5' })
    )
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.data.posts_refresh_cooldown_seconds).toBe(1800);
    expect(response.body.data.posts_time_window_days).toBe(7);
    expect(response.body.data['openai.model']).toBe('gpt-5');
    expect(response.body.data.updated_by).toBe('admin@example.com');

    const updatedAt = new Date(response.body.data.updated_at).valueOf();
    expect(Number.isNaN(updatedAt)).toBe(false);
    expect(updatedAt).toBeGreaterThan(initial.updatedAt.valueOf());
  });

  it('rejects updates from non-admin users', async () => {
    const response = await withAuth(TOKENS.user, request(app).patch('/api/v1/app-params').send({ posts_time_window_days: 5 }))
      .expect('Content-Type', /json/)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('enforces integer and boundary validations', async () => {
    await withAuth(
      TOKENS.admin,
      request(app).put('/api/v1/app-params').send({ posts_refresh_cooldown_seconds: -1 })
    )
      .expect('Content-Type', /json/)
      .expect(422);

    await withAuth(
      TOKENS.admin,
      request(app).patch('/api/v1/app-params').send({ posts_time_window_days: 0 })
    )
      .expect('Content-Type', /json/)
      .expect(422);

    await withAuth(
      TOKENS.admin,
      request(app).patch('/api/v1/app-params').send({ posts_refresh_cooldown_seconds: 1.5 })
    )
      .expect('Content-Type', /json/)
      .expect(400);
  });

  it('allows updating the OpenAI model with any supported value', async () => {
    for (const model of SUPPORTED_MODELS) {
      const response = await withAuth(
        TOKENS.admin,
        request(app)
          .patch('/api/v1/app-params')
          .send({ 'openai.model': model })
      )
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.data['openai.model']).toBe(model);
    }
  });

  it('rejects unsupported OpenAI model values with a 422 error', async () => {
    const response = await withAuth(
      TOKENS.admin,
      request(app).patch('/api/v1/app-params').send({ 'openai.model': 'gpt-5-ultra' })
    )
      .expect('Content-Type', /json/)
      .expect(422);

    expect(response.body.error.code).toBe('UNSUPPORTED_OPENAI_MODEL');
    expect(response.body.error.message).toContain('openai.model must be one of');
  });

  it('is idempotent when ensuring default parameters', async () => {
    const first = await appParamsService.ensureDefaultAppParams();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await appParamsService.ensureDefaultAppParams();

    expect(second.postsRefreshCooldownSeconds).toBe(3600);
    expect(second.postsTimeWindowDays).toBe(7);
    expect(second.updatedAt.valueOf()).toBe(first.updatedAt.valueOf());
  });
});
