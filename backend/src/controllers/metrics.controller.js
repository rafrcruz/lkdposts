const config = require('../config');
const { metricsRegistry } = require('../utils/metrics');

const getMetrics = async (req, res) => {
  if (!config.observability.metricsEnabled) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'METRICS_DISABLED',
        message: 'Metrics collection is disabled',
      },
      meta: {
        requestId: req.id,
      },
    });
  }

  res.setHeader('Content-Type', metricsRegistry.contentType);
  const metrics = await metricsRegistry.metrics();
  return res.send(metrics);
};

module.exports = {
  getMetrics,
};
