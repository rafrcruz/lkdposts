const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');
const openapiSpecification = require('../docs/openapi');

const router = express.Router();

if (config.observability.swaggerEnabled) {
  router.use('/', swaggerUi.serve, swaggerUi.setup(openapiSpecification, { explorer: true }));
} else {
  router.get('/', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'DOCS_DISABLED',
        message: 'API documentation is disabled',
      },
      meta: {
        requestId: req.id,
      },
    });
  });
}

module.exports = router;
