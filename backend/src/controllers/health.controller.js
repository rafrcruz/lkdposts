const config = require('../config');

const buildHealthPayload = () => ({
  status: 'ok',
  uptime: process.uptime(),
  environment: config.env,
  timestamp: new Date().toISOString(),
  release: config.release,
});

const buildLiveness = () => ({
  status: 'ok',
  uptime: process.uptime(),
  environment: config.env,
  timestamp: new Date().toISOString(),
  release: config.release,
});

const buildReadiness = () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  release: config.release,
});

const getHealth = (req, res) => {
  return res.success(buildHealthPayload());
};

const getLiveness = (req, res) => {
  return res.success(buildLiveness());
};

const getReadiness = (req, res) => {
  return res.success(buildReadiness());
};

module.exports = {
  getHealth,
  getLiveness,
  getReadiness,
};
