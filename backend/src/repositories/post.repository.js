const { prisma } = require('../lib/prisma');

const createPlaceholder = ({ articleId }) =>
  prisma.post.create({
    data: {
      articleId,
      status: 'PENDING',
      content: null,
    },
  });

const upsertForArticle = async ({ articleId, data }) => {
  const existing = await prisma.post.findMany({ where: { articleId }, take: 1 });
  const current = existing[0] ?? null;

  if (current) {
    return prisma.post.update({
      where: { articleId },
      data,
    });
  }

  return prisma.post.create({
    data: {
      articleId,
      ...data,
    },
  });
};

const updateByArticleId = ({ articleId, data }) =>
  prisma.post.update({
    where: { articleId },
    data,
  });

const findByArticleId = (articleId) => prisma.post.findUnique({ where: { articleId } });

const deleteManyByArticleIds = (articleIds) =>
  prisma.post.deleteMany({
    where: { articleId: { in: articleIds } },
  });

module.exports = {
  createPlaceholder,
  upsertForArticle,
  updateByArticleId,
  findByArticleId,
  deleteManyByArticleIds,
};
