const config = require('../config');
const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const { validateSessionToken } = require('../services/auth.service');
const { Sentry } = require('../lib/sentry');

const cookieName = config.auth.session.cookieName;

const getTokenFromAuthHeader = (req) => {
  const header = req.headers?.authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }

  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  return null;
};

const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.signedCookies?.[cookieName] ?? req.cookies?.[cookieName] ?? getTokenFromAuthHeader(req);

  if (!token) {
    throw new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' });
  }

  const result = await validateSessionToken({
    token,
    userAgent: req.headers['user-agent'] ?? 'unknown',
    ipAddress: req.ip,
  });

  if (!result) {
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      signed: true,
      path: '/',
    });
    throw new ApiError({ statusCode: 401, code: 'SESSION_INVALID', message: 'Session expired or invalid' });
  }

  const { session } = result;

  req.user = {
    id: session.userId,
    email: session.user.email,
    role: session.user.role,
  };
  req.session = {
    id: session.id,
    expiresAt: session.expiresAt,
  };

  try {
    Sentry.configureScope((scope) => {
      scope.setUser({
        id: String(session.userId),
        email: session.user.email,
        role: session.user.role,
      });
    });
  } catch (error) {
    console.warn('Failed to configure Sentry user scope', error);
  }

  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    signed: true,
    expires: session.expiresAt,
    path: '/',
  });

  next();
});

module.exports = {
  requireAuth,
};


