const { prisma } = require('../lib/prisma');

const getClient = (client) => client ?? prisma;

const defaultOrder = [{ position: 'asc' }, { createdAt: 'asc' }];

const findManyByUser = async ({ userId, skip = 0, take, orderBy = defaultOrder, enabled }, client) => {
  const prismaClient = getClient(client);
  const enabledFilter = enabled === undefined ? {} : { enabled };

  return prismaClient.prompt.findMany({
    where: {
      userId,
      ...enabledFilter,
    },
    orderBy,
    skip,
    take,
  });
};

const countByUser = async ({ userId, enabled }, client) => {
  const prismaClient = getClient(client);
  const enabledFilter = enabled === undefined ? {} : { enabled };

  return prismaClient.prompt.count({
    where: {
      userId,
      ...enabledFilter,
    },
  });
};

const findById = async (id, client) => {
  const prismaClient = getClient(client);

  return prismaClient.prompt.findUnique({ where: { id } });
};

const findByIdForUser = async ({ id, userId }, client) => {
  const prismaClient = getClient(client);

  return prismaClient.prompt.findFirst({ where: { id, userId } });
};

const findManyByIdsForUser = async ({ userId, ids }, client) => {
  const prismaClient = getClient(client);

  if (Array.isArray(ids) && ids.length > 0) {
    return prismaClient.prompt.findMany({
      where: {
        userId,
        id: { in: ids },
      },
    });
  }

  return [];
};

const findMaxPositionForUser = async ({ userId }, client) => {
  const prismaClient = getClient(client);

  const result = await prismaClient.prompt.aggregate({
    where: { userId },
    _max: { position: true },
  });

  return result?._max?.position ?? null;
};

const create = async ({ userId, title, content, position, enabled = true }, client) => {
  const prismaClient = getClient(client);

  return prismaClient.prompt.create({
    data: {
      userId,
      title,
      content,
      position,
      enabled,
    },
  });
};

const update = async ({ id, data }, client) => {
  const prismaClient = getClient(client);

  return prismaClient.prompt.update({
    where: { id },
    data,
  });
};

const deleteById = async ({ id }, client) => {
  const prismaClient = getClient(client);

  return prismaClient.prompt.delete({ where: { id } });
};

module.exports = {
  findManyByUser,
  countByUser,
  findById,
  findByIdForUser,
  findManyByIdsForUser,
  findMaxPositionForUser,
  create,
  update,
  deleteById,
};
