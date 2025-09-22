const asyncHandler = require('../utils/async-handler');
const {
  listAllowedUsers,
  createAllowedUser,
  updateAllowedUserRole,
  removeAllowedUser,
} = require('../services/allowlist.service');
const config = require('../config');

const list = asyncHandler(async (req, res) => {
  const { cursor, limit } = req.validated?.query ?? {};
  const result = await listAllowedUsers({ cursor, limit });

  res.withCache(30, 'private');

  return res.success(
    {
      items: result.items.map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
        immutable: user.email === config.auth.superAdminEmail,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    },
    {
      meta: {
        nextCursor: result.nextCursor,
        total: result.total,
        limit: result.limit,
      },
    }
  );
});

const create = asyncHandler(async (req, res) => {
  const { email, role } = req.validated?.body ?? {};

  const created = await createAllowedUser({ email, role });

  console.info('Allowlist entry created', {
    actor: req.user.email,
    email: created.email,
    role: created.role,
  });

  return res.success(
    {
      id: created.id,
      email: created.email,
      role: created.role,
      immutable: created.email === config.auth.superAdminEmail,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
    { statusCode: 201 }
  );
});

const updateRole = asyncHandler(async (req, res) => {
  const { id } = req.validated?.params ?? {};
  const { role } = req.validated?.body ?? {};

  const updated = await updateAllowedUserRole({ id, role });

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
  const { id } = req.validated?.params ?? {};

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
