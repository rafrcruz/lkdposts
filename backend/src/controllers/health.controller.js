const config = require('../config');

const buildOperationalStatus = () => ({
  status: 'ok',
  uptime: process.uptime(),
  environment: config.env,
  timestamp: new Date().toISOString(),
  release: config.release,
});

const buildReadinessPayload = () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  release: config.release,
});

const getHealth = (req, res) => {
  return res.success(buildOperationalStatus());
};

const getLiveness = (req, res) => {
  return res.success(buildOperationalStatus());
};

const getReadiness = (req, res) => {
  return res.success(buildReadinessPayload());
};

module.exports = {
  getHealth,
  getLiveness,
  getReadiness,
};
