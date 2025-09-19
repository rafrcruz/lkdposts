const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.database.url,
    },
  },
  log: config.isProduction ? ['error'] : ['error', 'warn'],
});

const disconnectDatabase = async () => {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to disconnect database client:', error);
  }
};

module.exports = {
  prisma,
  disconnectDatabase,
};

