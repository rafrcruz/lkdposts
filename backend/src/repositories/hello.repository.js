const { prisma } = require('../lib/prisma');

const findLatestMessage = () =>
  prisma.helloMessage.findFirst({
    orderBy: { createdAt: 'desc' },
  });

module.exports = {
  findLatestMessage,
};
