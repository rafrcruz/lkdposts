const config = require('../config');
const { getLatestMessage, DEFAULT_MESSAGE } = require('../services/hello.service');

const getHello = async (req, res) => {
  try {
    const message = await getLatestMessage();
    res.withCache(config.cache.maxAgeSeconds);
    return res.success({ message });
  } catch (error) {
    console.error('Failed to fetch hello message from database:', error);
    res.withCache(config.cache.maxAgeSeconds);
    return res.success({ message: DEFAULT_MESSAGE });
  }
};

module.exports = {
  getHello,
};
