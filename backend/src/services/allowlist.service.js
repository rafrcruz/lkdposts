const { Prisma } = require('@prisma/client');
const config = require('../config');
const { prisma } = require('../lib/prisma');
const { ROLES } = require('../constants/roles');
const ApiError = require('../utils/api-error');

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

const ensureSuperAdmin = async () => {
  const email = config.auth.superAdminEmail;

  if (!email) {
    console.warn('SUPERADMIN_EMAIL is not defined; skipping super admin ensure step.');
    return;
  }

  await prisma.allowedUser.upsert({
    where: { email },
    update: { role: ROLES.ADMIN },
    create: {
      email,
      role: ROLES.ADMIN,
    },
  });
};

const findAllowedUserByEmail = async (email) => {
  if (!email) {
    return null;
  }

  return prisma.allowedUser.findUnique({ where: { email: normalizeEmail(email) } });
};

const listAllowedUsers = async () => {
  return prisma.allowedUser.findMany({
    orderBy: { email: 'asc' },
  });
};

const createAllowedUser = async ({ email, role }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new ApiError({ statusCode: 400, code: 'EMAIL_REQUIRED', message: 'Email is required' });
  }

  if (!Object.values(ROLES).includes(role)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_ROLE', message: 'Invalid role provided' });
  }

  try {
    return await prisma.allowedUser.create({
      data: {
        email: normalizedEmail,
        role,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiError({ statusCode: 409, code: 'ALLOWLIST_DUPLICATE', message: 'Email already exists in allowlist' });
    }
    throw error;
  }
};

const updateAllowedUserRole = async ({ id, role }) => {
  if (!Object.values(ROLES).includes(role)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_ROLE', message: 'Invalid role provided' });
  }

  const user = await prisma.allowedUser.findUnique({ where: { id } });

  if (!user) {
    throw new ApiError({ statusCode: 404, code: 'ALLOWLIST_NOT_FOUND', message: 'Allowed user not found' });
  }

  if (user.email === config.auth.superAdminEmail && role !== ROLES.ADMIN) {
    throw new ApiError({ statusCode: 400, code: 'SUPERADMIN_IMMUTABLE', message: 'Cannot change super admin role' });
  }

  return prisma.allowedUser.update({
    where: { id },
    data: {
      role,
    },
  });
};

const removeAllowedUser = async (id) => {
  const user = await prisma.allowedUser.findUnique({ where: { id } });

  if (!user) {
    throw new ApiError({ statusCode: 404, code: 'ALLOWLIST_NOT_FOUND', message: 'Allowed user not found' });
  }

  if (user.email === config.auth.superAdminEmail) {
    throw new ApiError({ statusCode: 400, code: 'SUPERADMIN_IMMUTABLE', message: 'Cannot remove the super admin account' });
  }

  await prisma.allowedUser.delete({ where: { id } });
};

module.exports = {
  ensureSuperAdmin,
  findAllowedUserByEmail,
  listAllowedUsers,
  createAllowedUser,
  updateAllowedUserRole,
  removeAllowedUser,
  normalizeEmail,
};
