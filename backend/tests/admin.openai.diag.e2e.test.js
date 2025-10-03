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
const { __mockClient } = require('../src/lib/openai-client');

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

describe('Admin OpenAI diagnostics API', () => {
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
    __mockClient.responses.create.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns diagnostics information when OpenAI responds successfully', async () => {
    __mockClient.responses.create.mockResolvedValueOnce({
      id: 'resp_123',
      model: 'gpt-5',
      usage: { input_tokens: 12, output_tokens: 3, cached_tokens: 4 },
    });

    const response = await withAuth(
      TOKENS.admin,
      request(app).get('/api/v1/admin/openai/diag?model=gpt-5-mini'),
    )
      .expect('Content-Type', /json/)
      .expect(200);

    expect(__mockClient.responses.create).toHaveBeenCalledWith({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: 'ping' },
        { role: 'user', content: 'hello' },
      ],
    });

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        ok: true,
        model: 'gpt-5-mini',
        baseURL: 'https://api.openai.com/v1',
        timeoutMs: 30000,
        usage: { input_tokens: 12, output_tokens: 3, cached_tokens: 4 },
        cachedTokens: 4,
      }),
    );
    expect(typeof response.body.data.latencyMs).toBe('number');
  });

  it('returns structured error information when OpenAI fails', async () => {
    const error = new Error('OpenAI request failed with status 401');
    error.status = 401;
    error.openai = {
      type: 'invalid_request_error',
      code: 'invalid_api_key',
      message: 'Incorrect API key provided: test',
    };
    error.response = {
      headers: new Headers({ 'x-request-id': 'req_456' }),
    };

    __mockClient.responses.create.mockRejectedValueOnce(error);

    const response = await withAuth(TOKENS.admin, request(app).get('/api/v1/admin/openai/diag'))
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        ok: false,
        model: 'gpt-5-nano',
        baseURL: 'https://api.openai.com/v1',
        timeoutMs: 30000,
        error: {
          status: 401,
          type: 'invalid_request_error',
          code: 'invalid_api_key',
          message: 'Incorrect API key provided: test',
          request_id: 'req_456',
        },
      }),
    );
    expect(typeof response.body.data.latencyMs).toBe('number');
  });
});
