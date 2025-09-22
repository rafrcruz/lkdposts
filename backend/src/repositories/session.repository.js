const { prisma } = require('../lib/prisma');

const create = ({ tokenHash, userId, createdAt, expiresAt, lastUsedAt, userAgent, ipAddress }) =>
  prisma.userSession.create({
    data: {
      tokenHash,
      userId,
      createdAt,
      expiresAt,
      lastUsedAt,
      userAgent,
      ipAddress,
    },
    include: { user: true },
  });

const findByTokenHash = (tokenHash) =>
  prisma.userSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

const updateById = (id, data) =>
  prisma.userSession.update({
    where: { id },
    data,
    include: { user: true },
  });

const revokeByTokenHash = (tokenHash) =>
  prisma.userSession.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

module.exports = {
  create,
  findByTokenHash,
  updateById,
  revokeByTokenHash,
};
