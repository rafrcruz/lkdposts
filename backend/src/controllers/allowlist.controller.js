const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const {
  listAllowedUsers,
  createAllowedUser,
  updateAllowedUserRole,
  removeAllowedUser,
  normalizeEmail,
} = require('../services/allowlist.service');
const { ROLES } = require('../constants/roles');
const config = require('../config');

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_ID', message: 'Invalid identifier' });
  }
  return id;
};

const normalizeRole = (role, fallback = ROLES.USER) => {
  if (!role) {
    return fallback;
  }

  if (typeof role === 'string') {
    return role.toLowerCase();
  }

  return role;
};

const list = asyncHandler(async (req, res) => {
  const users = await listAllowedUsers();
  return res.success({
    items: users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      immutable: user.email === config.auth.superAdminEmail,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  });
});

const create = asyncHandler(async (req, res) => {
  const { email, role } = req.body ?? {};

  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);

  if (!normalizedEmail) {
    throw new ApiError({ statusCode: 400, code: 'EMAIL_REQUIRED', message: 'Email is required' });
  }

  if (!Object.values(ROLES).includes(normalizedRole)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_ROLE', message: 'Invalid role provided' });
  }

  const created = await createAllowedUser({ email: normalizedEmail, role: normalizedRole });

  console.info('Allowlist entry created', {
    actor: req.user.email,
    email: created.email,
    role: created.role,
  });

  return res.success({
    id: created.id,
    email: created.email,
    role: created.role,
    immutable: created.email === config.auth.superAdminEmail,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  }, { statusCode: 201 });
});

const updateRole = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { role } = req.body ?? {};

  const normalizedRole = normalizeRole(role, null);

  if (!normalizedRole) {
    throw new ApiError({ statusCode: 400, code: 'ROLE_REQUIRED', message: 'Role is required' });
  }

  if (!Object.values(ROLES).includes(normalizedRole)) {
    throw new ApiError({ statusCode: 400, code: 'INVALID_ROLE', message: 'Invalid role provided' });
  }

  const updated = await updateAllowedUserRole({ id, role: normalizedRole });

  console.info('Allowlist role updated', {
    actor: req.user.email,
    email: updated.email,
    role: updated.role,
  });

  return res.success({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    immutable: updated.email === config.auth.superAdminEmail,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);

  await removeAllowedUser(id);

  console.info('Allowlist entry removed', {
    actor: req.user.email,
    id,
  });

  return res.success({ message: 'Allowlist entry removed' });
});

module.exports = {
  list,
  create,
  updateRole,
  remove,
};
