const express = require('express');
const newsGenerationController = require('../../../controllers/admin/news-generation.controller');
const { validateRequest } = require('../../../middlewares/validate-request');
const { previewPayloadQuerySchema } = require('../../../schemas/news.schema');

const router = express.Router();

router.post('/generate-posts', newsGenerationController.triggerGeneration);
router.get('/generation-status', newsGenerationController.getStatus);
router.get(
  '/preview-payload',
  validateRequest({ query: previewPayloadQuerySchema }),
  newsGenerationController.previewPayload,
);

module.exports = router;

