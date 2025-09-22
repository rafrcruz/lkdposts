const { Prisma } = require('@prisma/client');
const config = require('../config');
const allowlistRepository = require('../repositories/allowlist.repository');
const { ROLES } = require('../constants/roles');
const { ALLOWLIST_MAX_PAGE_SIZE } = require('../constants/allowlist');
const ApiError = require('../utils/api-error');

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

const ensureSuperAdmin = async () => {
  const email = normalizeEmail(config.auth.superAdminEmail);

  if (!email) {
    console.warn('SUPERADMIN_EMAIL is not defined; skipping super admin ensure step.');
    return;
  }

  await allowlistRepository.upsertSuperAdmin({
    email,
    role: ROLES.ADMIN,
  });
};

const findAllowedUserByEmail = async (email) => {
  if (!email) {
    return null;
  }

  return allowlistRepository.findByEmail(normalizeEmail(email));
};

const listAllowedUsers = async ({ cursor, limit } = {}) => {
  const safeLimit = Math.min(Math.max(limit ?? 20, 1), ALLOWLIST_MAX_PAGE_SIZE);

  const entries = await allowlistRepository.findPage({
    cursorId: cursor ?? undefined,
    take: safeLimit + 1,
  });

  const hasMore = entries.length > safeLimit;
  const items = hasMore ? entries.slice(0, safeLimit) : entries;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  const total = await allowlistRepository.countAll();

  return {
    items,
    nextCursor,
    total,
    limit: safeLimit,
  };
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
    return await allowlistRepository.create({ email: normalizedEmail, role });
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

  const user = await allowlistRepository.findById(id);

  if (!user) {
    throw new ApiError({ statusCode: 404, code: 'ALLOWLIST_NOT_FOUND', message: 'Allowed user not found' });
  }

  if (user.email === normalizeEmail(config.auth.superAdminEmail) && role !== ROLES.ADMIN) {
    throw new ApiError({ statusCode: 400, code: 'SUPERADMIN_IMMUTABLE', message: 'Cannot change super admin role' });
  }

  return allowlistRepository.updateRoleById({ id, role });
};

const removeAllowedUser = async (id) => {
  const user = await allowlistRepository.findById(id);

  if (!user) {
    throw new ApiError({ statusCode: 404, code: 'ALLOWLIST_NOT_FOUND', message: 'Allowed user not found' });
  }

  if (user.email === normalizeEmail(config.auth.superAdminEmail)) {
    throw new ApiError({ statusCode: 400, code: 'SUPERADMIN_IMMUTABLE', message: 'Cannot remove the super admin account' });
  }

  await allowlistRepository.deleteById(id);
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
