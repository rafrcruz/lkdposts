const request = require('supertest');

jest.mock('../src/services/auth.service', () => {
  const actual = jest.requireActual('../src/services/auth.service');
  return {
    ...actual,
    validateSessionToken: jest.fn(),
  };
});

const app = require('../src/app');
const config = require('../src/config');
const authService = require('../src/services/auth.service');

describe('Auth debug endpoint', () => {
  const sessionCookieName = config.auth.session.cookieName;
  const originalDebugFlag = config.debug.authInspector;
  const originalRuntime = { ...config.runtime };

  const restoreConfig = () => {
    config.debug.authInspector = originalDebugFlag;
    Object.assign(config.runtime, originalRuntime);
  };

  beforeEach(() => {
    restoreConfig();
    authService.validateSessionToken.mockReset();
  });

  afterAll(() => {
    restoreConfig();
  });

  it('returns 404 when debug inspector is disabled outside preview', async () => {
    config.debug.authInspector = false;
    config.runtime.isPreviewDeployment = false;

    const response = await request(app)
      .get('/api/v1/auth/debug')
      .set('Origin', 'http://localhost:5173')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      })
    );
  });

  it('exposes diagnostics when debug flag is enabled', async () => {
    config.debug.authInspector = true;
    config.runtime.isPreviewDeployment = false;
    config.runtime.isProductionDeployment = true;

    const response = await request(app)
      .get('/api/v1/auth/debug')
      .set('Origin', 'http://localhost:5173')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          origin: 'http://localhost:5173',
          hasCookie: false,
          cookieNames: [],
          authenticated: false,
          userIdOrEmail: null,
          release: config.release,
        }),
      })
    );
  });

  it('confirms authentication when a valid session cookie is present', async () => {
    config.debug.authInspector = true;
    config.runtime.isPreviewDeployment = false;
    config.runtime.isProductionDeployment = true;

    const sessionToken = 'valid-session-token';
    authService.validateSessionToken.mockResolvedValue({
      session: {
        user: {
          email: 'user@example.com',
        },
      },
      renewed: false,
    });

    const response = await request(app)
      .get('/api/v1/auth/debug')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [`${sessionCookieName}=${sessionToken}`])
      .expect('Content-Type', /json/)
      .expect(200);

    expect(authService.validateSessionToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: sessionToken,
        userAgent: expect.any(String),
        ipAddress: expect.any(String),
      }),
      { touch: false }
    );

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          hasCookie: true,
          authenticated: true,
          userIdOrEmail: 'user@example.com',
          cookieNames: expect.arrayContaining([sessionCookieName]),
        }),
      })
    );
  });

  it('exposes diagnostics in preview deployments even without debug flag', async () => {
    config.debug.authInspector = false;
    config.runtime.isPreviewDeployment = true;
    config.runtime.isProductionDeployment = false;

    const response = await request(app)
      .get('/api/v1/auth/debug')
      .set('Origin', 'http://localhost:5173')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          hasCookie: false,
          authenticated: false,
        }),
      })
    );
  });
});

