const config = require('../config');
const { prisma } = require('../lib/prisma');

const DEFAULT_MESSAGE = 'hello mundo';

const getHello = async (req, res) => {
  let message = DEFAULT_MESSAGE;

  try {
    const latestMessage = await prisma.helloMessage.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (latestMessage) {
      message = latestMessage.message;
    }
  } catch (error) {
    console.error('Failed to fetch hello message from database:', error);
  }

  res.withCache(config.cache.maxAgeSeconds);
  return res.success({ message });
};

module.exports = {
  getHello,
};
