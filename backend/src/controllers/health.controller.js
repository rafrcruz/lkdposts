const config = require('../config');

const buildLiveness = () => ({
  status: 'ok',
  uptime: process.uptime(),
  environment: config.env,
  timestamp: new Date().toISOString(),
});

const buildReadiness = () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
});

const getLiveness = (req, res) => {
  return res.success(buildLiveness());
};

const getReadiness = (req, res) => {
  return res.success(buildReadiness());
};

module.exports = {
  getLiveness,
  getReadiness,
};
