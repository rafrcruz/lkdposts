const { prisma } = require('../lib/prisma');

const buildOwnerWhereClause = ({ ownerKey, search }) => {
  const where = { ownerKey };

  if (search) {
    where.url = { contains: search, mode: 'insensitive' };
  }

  return where;
};

const findPageByOwner = async ({ ownerKey, cursorId, take, search }) => {
  const query = {
    where: buildOwnerWhereClause({ ownerKey, search }),
    orderBy: { id: 'asc' },
    take,
  };

  if (cursorId) {
    query.cursor = { id: cursorId };
    query.skip = 1;
  }

  return prisma.feed.findMany(query);
};

const countByOwner = ({ ownerKey, search }) =>
  prisma.feed.count({ where: buildOwnerWhereClause({ ownerKey, search }) });

const findById = (id) => prisma.feed.findUnique({ where: { id } });

const findByOwnerAndUrl = ({ ownerKey, url }) =>
  prisma.feed.findUnique({ where: { ownerKey_url: { ownerKey, url } } });

const findManyByOwnerAndUrls = ({ ownerKey, urls }) =>
  prisma.feed.findMany({
    where: {
      ownerKey,
      url: { in: urls },
    },
  });

const findAllByOwner = (ownerKey) =>
  prisma.feed.findMany({
    where: { ownerKey },
    orderBy: { id: 'asc' },
  });

const create = ({ ownerKey, url, title }) =>
  prisma.feed.create({
    data: {
      ownerKey,
      url,
      title,
    },
  });

const updateById = (id, data) =>
  prisma.feed.update({
    where: { id },
    data,
  });

const deleteById = (id) => prisma.feed.delete({ where: { id } });

module.exports = {
  findPageByOwner,
  countByOwner,
  findById,
  findByOwnerAndUrl,
  findManyByOwnerAndUrls,
  findAllByOwner,
  create,
  updateById,
  deleteById,
};
