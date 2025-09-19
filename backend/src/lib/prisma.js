const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const resolveDatabaseUrl = () => {
  if (config.isProduction && config.database.pooledUrl) {
    if (!config.isTest) {
      console.info('Prisma datasource: using pooled connection string (PRISMA_URL)');
    }
    return config.database.pooledUrl;
  }

  return config.database.url;
};

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: resolveDatabaseUrl(),
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
