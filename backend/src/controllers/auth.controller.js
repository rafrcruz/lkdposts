const config = require('../config');
const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const {
  authenticateWithGoogle,
  revokeSessionByToken,
} = require('../services/auth.service');
const { Sentry } = require('../lib/sentry');
const { getSessionCookieOptions, getSessionCookieBaseOptions } = require('../utils/session-cookie');

const { session: sessionConfig } = config.auth;

const loginWithGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.body ?? {};

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
  const token = req.signedCookies?.[sessionConfig.cookieName] ?? req.cookies?.[sessionConfig.cookieName];

  await revokeSessionByToken(token);

  res.clearCookie(sessionConfig.cookieName, getSessionCookieBaseOptions());

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
  getCurrentUser,
};



