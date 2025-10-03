const express = require('express');
const openAiController = require('../../../controllers/admin/openai.controller');

const router = express.Router();

router.get('/diag', openAiController.runDiagnostics);

module.exports = router;
