const config = require('../config');
const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const {
  authenticateWithGoogle,
  revokeSessionByToken,
} = require('../services/auth.service');
const { Sentry } = require('../lib/sentry');

const { session: sessionConfig } = config.auth;

const getCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  signed: true,
  expires: expiresAt,
  path: '/',
});

const loginWithGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.body ?? {};

  const { token, session } = await authenticateWithGoogle({
    idToken,
    userAgent: req.headers['user-agent'] ?? 'unknown',
    ipAddress: req.ip,
  });

  res.cookie(sessionConfig.cookieName, token, getCookieOptions(session.expiresAt));

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

  res.clearCookie(sessionConfig.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    signed: true,
    path: '/',
  });

  try {
    Sentry.configureScope((scope) => {
      scope.setUser(null);
    });
  } catch (error) {
    // ignore scope errors when Sentry is disabled
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
