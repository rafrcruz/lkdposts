const express = require('express');
const newsGenerationController = require('../../../controllers/admin/news-generation.controller');

const router = express.Router();

router.post('/generate-posts', newsGenerationController.triggerGeneration);
router.get('/generation-status', newsGenerationController.getStatus);

module.exports = router;

