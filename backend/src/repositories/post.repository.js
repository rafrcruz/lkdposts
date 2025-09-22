const { prisma } = require('../lib/prisma');

const create = ({ articleId, content }) =>
  prisma.post.create({
    data: {
      articleId,
      content,
    },
  });

const deleteManyByArticleIds = (articleIds) =>
  prisma.post.deleteMany({
    where: { articleId: { in: articleIds } },
  });

module.exports = {
  create,
  deleteManyByArticleIds,
};
