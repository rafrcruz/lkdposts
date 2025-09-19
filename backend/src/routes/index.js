const express = require('express');
const config = require('../config');
const healthRoutes = require('./health.routes');
const metricsRoutes = require('./metrics.routes');
const docsRoutes = require('./docs.routes');
const v1Routes = require('./v1');

const router = express.Router();

router.use('/health', healthRoutes);

if (config.observability.metricsEnabled) {
  router.use('/metrics', metricsRoutes);
}

if (config.observability.swaggerEnabled) {
  router.use('/docs', docsRoutes);
}

router.use('/api/v1', v1Routes);

module.exports = router;
