const { prisma } = require('../lib/prisma');

const upsertSuperAdmin = ({ email, role }) =>
  prisma.allowedUser.upsert({
    where: { email },
    update: { role },
    create: { email, role },
  });

const findByEmail = (email) => prisma.allowedUser.findUnique({ where: { email } });

const findPage = ({ cursorId, take }) => {
  const query = {
    orderBy: { id: 'asc' },
    take,
  };

  if (cursorId) {
    query.cursor = { id: cursorId };
    query.skip = 1;
  }

  return prisma.allowedUser.findMany(query);
};

const countAll = () => prisma.allowedUser.count();

const create = ({ email, role }) =>
  prisma.allowedUser.create({
    data: { email, role },
  });

const findById = (id) => prisma.allowedUser.findUnique({ where: { id } });

const updateRoleById = ({ id, role }) =>
  prisma.allowedUser.update({
    where: { id },
    data: { role },
  });

const deleteById = (id) => prisma.allowedUser.delete({ where: { id } });

module.exports = {
  upsertSuperAdmin,
  findByEmail,
  findPage,
  countAll,
  create,
  findById,
  updateRoleById,
  deleteById,
};
