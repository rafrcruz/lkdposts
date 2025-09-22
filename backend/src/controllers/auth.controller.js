const config = require('../config');
const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const {
  authenticateWithGoogle,
  revokeSessionByToken,
  validateSessionToken,
} = require('../services/auth.service');
const { Sentry } = require('../lib/sentry');
const { getSessionCookieOptions, getSessionCookieBaseOptions } = require('../utils/session-cookie');

const { session: sessionConfig } = config.auth;
const sessionCookieName = sessionConfig.cookieName;

const createDebugNotFoundError = () =>
  new ApiError({ statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found' });

const loginWithGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.validated?.body ?? {};

  const { token, session } = await authenticateWithGoogle({
    idToken,
    userAgent: req.headers['user-agent'] ?? 'unknown',
    ipAddress: req.ip,
  });

  res.cookie(sessionConfig.cookieName, token, getSessionCookieOptions(session.expiresAt));

  console.info('User logged in', {
    email: session.user.email,
    role: session.user.role,
  });

  return res.success({
    email: session.user.email,
    role: session.user.role,
    expiresAt: session.expiresAt.toISOString(),
  });
});

const logout = asyncHandler(async (req, res) => {
  const token = req.signedCookies?.[sessionCookieName] ?? req.cookies?.[sessionCookieName];

  await revokeSessionByToken(token);

  res.clearCookie(sessionCookieName, getSessionCookieBaseOptions());

  try {
    Sentry.configureScope((scope) => {
      scope.setUser(null);
    });
  } catch (error) {
    console.warn('Failed to clear Sentry user scope', error);
  }

  console.info('User logged out', {
    email: req.user?.email ?? 'anonymous',
  });

  return res.success({ message: 'Logged out' });
});

const debugAuth = asyncHandler(async (req, res) => {
  const isPreviewDeployment = config.runtime?.isPreviewDeployment ?? false;
  const debugFlagEnabled = config.debug?.authInspector ?? false;
  const debugEnabled = debugFlagEnabled || isPreviewDeployment;

  if (!debugEnabled) {
    throw createDebugNotFoundError();
  }

  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : null;

  const cookieNames = Array.from(
    new Set([
      ...Object.keys(req.cookies ?? {}),
      ...Object.keys(req.signedCookies ?? {}),
    ])
  ).sort();

  const token = req.signedCookies?.[sessionCookieName] ?? req.cookies?.[sessionCookieName] ?? null;
  const hasCookie = Boolean(token);

  let authenticated = false;
  let userIdOrEmail = null;

  if (token) {
    try {
      const result = await validateSessionToken(
        {
          token,
          userAgent: req.headers['user-agent'] ?? 'unknown',
          ipAddress: req.ip,
        },
        { touch: false }
      );

      if (result?.session) {
        authenticated = true;
        userIdOrEmail = result.session.user?.email ?? null;
        if (!userIdOrEmail && result.session.userId != null) {
          userIdOrEmail = String(result.session.userId);
        }
      }
    } catch (error) {
      console.error('auth.debug.internal_error', { message: error.message });
      throw error;
    }
  }

  res.set('Cache-Control', 'no-store');

  return res.success({
    origin,
    hasCookie,
    cookieNames,
    authenticated,
    userIdOrEmail,
    release: config.release,
  });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user || !req.session) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  return res.success({
    email: req.user.email,
    role: req.user.role,
    expiresAt: req.session.expiresAt.toISOString(),
  });
});

module.exports = {
  loginWithGoogle,
  logout,
  debugAuth,
  getCurrentUser,
};
