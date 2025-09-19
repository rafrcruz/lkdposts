const client = require('prom-client');
const config = require('../config');

if (config.observability.metricsEnabled) {
  client.collectDefaultMetrics();
}

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.3, 0.5, 0.75, 1, 1.5, 2, 5],
});

const metricsMiddleware = (req, res, next) => {
  if (!config.observability.metricsEnabled) {
    return next();
  }

  const endTimer = httpRequestDurationSeconds.startTimer();

  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split('?')[0];
    endTimer({
      method: req.method,
      route,
      status_code: res.statusCode,
    });
  });

  next();
};

module.exports = {
  metricsMiddleware,
  metricsRegistry: client.register,
};
