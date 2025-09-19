const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { prisma } = require('../lib/prisma');
const ApiError = require('../utils/api-error');
const {
  ensureSuperAdmin,
  findAllowedUserByEmail,
  normalizeEmail,
} = require('./allowlist.service');

const googleClient = new OAuth2Client({
  clientId: config.auth.google.clientId,
  clientSecret: config.auth.google.clientSecret,
});

const SESSION_TTL_MS = config.auth.session.ttlSeconds * 1000;
const RENEW_THRESHOLD_MS = config.auth.session.renewThresholdSeconds * 1000;

const hashToken = (token) =>
  crypto.createHmac('sha256', config.auth.session.secret).update(token).digest('hex');

const generateSessionToken = () => crypto.randomBytes(48).toString('hex');

const verifyGoogleIdToken = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.auth.google.clientId,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new ApiError({ statusCode: 400, code: 'GOOGLE_NO_EMAIL', message: 'Google account does not expose email address' });
    }

    if (!payload.email_verified) {
      throw new ApiError({ statusCode: 401, code: 'GOOGLE_EMAIL_NOT_VERIFIED', message: 'Google email address is not verified' });
    }

    return {
      email: normalizeEmail(payload.email),
      name: payload.name,
      picture: payload.picture,
      subject: payload.sub,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    console.error('Failed to verify Google ID token:', error);
    throw new ApiError({ statusCode: 401, code: 'GOOGLE_TOKEN_INVALID', message: 'Invalid Google token' });
  }
};

const createSessionForUser = async ({ userId, userAgent, ipAddress }) => {
  const sessionToken = generateSessionToken();
  const tokenHash = hashToken(sessionToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session = await prisma.userSession.create({
    data: {
      tokenHash,
      userId,
      createdAt: now,
      expiresAt,
      lastUsedAt: now,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      ipAddress: ipAddress ? ipAddress.slice(0, 45) : null,
    },
    include: {
      user: true,
    },
  });

  return { token: sessionToken, session };
};

const revokeSessionByToken = async (token) => {
  if (!token) {
    return;
  }

  const tokenHash = hashToken(token);

  await prisma.userSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};

const findActiveSessionByToken = async (token) => {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.revokedAt) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  return session;
};

const touchSession = async (session, metadata = {}) => {
  const now = new Date();
  const timeToExpiry = session.expiresAt.getTime() - now.getTime();
  const shouldExtend = timeToExpiry <= RENEW_THRESHOLD_MS;

  const data = {
    lastUsedAt: now,
  };

  if (shouldExtend) {
    data.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  }

  if (metadata.userAgent) {
    data.userAgent = metadata.userAgent.slice(0, 255);
  }

  if (metadata.ipAddress) {
    data.ipAddress = metadata.ipAddress.slice(0, 45);
  }

  const updatedSession = await prisma.userSession.update({
    where: { id: session.id },
    data,
    include: { user: true },
  });

  return {
    session: updatedSession,
    renewed: shouldExtend,
  };
};

const initializeAuth = async () => {
  await ensureSuperAdmin();
};

const authenticateWithGoogle = async ({ idToken, userAgent, ipAddress }) => {
  if (!idToken) {
    throw new ApiError({ statusCode: 400, code: 'ID_TOKEN_REQUIRED', message: 'Google ID token is required' });
  }

  const googleProfile = await verifyGoogleIdToken(idToken);

  const allowedUser = await findAllowedUserByEmail(googleProfile.email);

  if (!allowedUser) {
    throw new ApiError({
      statusCode: 403,
      code: 'ALLOWLIST_DENIED',      message: 'Seu email nao esta autorizado para acessar este aplicativo.',
      details: { email: googleProfile.email },
    });
  }

  const { token, session } = await createSessionForUser({
    userId: allowedUser.id,
    userAgent,
    ipAddress,
  });

  if (!session.user) {
    session.user = allowedUser;
  }

  return {
    token,
    session,
  };
};

const validateSessionToken = async ({ token, userAgent, ipAddress }) => {
  const existingSession = await findActiveSessionByToken(token);

  if (!existingSession) {
    return null;
  }

  return touchSession(existingSession, { userAgent, ipAddress });
};

module.exports = {
  authenticateWithGoogle,
  initializeAuth,
  validateSessionToken,
  revokeSessionByToken,
  verifyGoogleIdToken,
};
