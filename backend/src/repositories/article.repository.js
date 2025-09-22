const { prisma } = require('../lib/prisma');

const findExistingDedupeKeys = ({ feedId, dedupeKeys }) => {
  if (!dedupeKeys.length) {
    return Promise.resolve([]);
  }

  return prisma.article.findMany({
    where: {
      feedId,
      dedupeKey: { in: dedupeKeys },
    },
    select: {
      dedupeKey: true,
    },
  });
};

const create = (data) =>
  prisma.article.create({
    data,
  });

const findIdsForCleanup = ({ ownerKey, olderThan }) =>
  prisma.article.findMany({
    where: {
      feed: { ownerKey },
      publishedAt: { lt: olderThan },
    },
    select: { id: true },
  });

const deleteManyByIds = (ids) =>
  prisma.article.deleteMany({
    where: { id: { in: ids } },
  });

const findRecentForOwner = ({ ownerKey, windowStart, currentTime, limit, cursorFilter, feedId }) => {
  const where = {
    feed: { ownerKey },
    publishedAt: {
      gte: windowStart,
      lte: currentTime,
    },
  };

  if (feedId != null) {
    where.feedId = feedId;
  }

  if (cursorFilter) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, cursorFilter] : [cursorFilter];
  }

  return prisma.article.findMany({
    where,
    orderBy: [
      { publishedAt: 'desc' },
      { id: 'desc' },
    ],
    take: limit,
    include: {
      post: true,
      feed: { select: { id: true, title: true, url: true } },
    },
  });
};

module.exports = {
  findExistingDedupeKeys,
  create,
  findIdsForCleanup,
  deleteManyByIds,
  findRecentForOwner,
};
