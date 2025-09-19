const config = require('../config');

const getHello = (req, res) => {
  res.withCache(config.cache.maxAgeSeconds);
  return res.success({ message: 'hello mundo' });
};

module.exports = {
  getHello,
};
