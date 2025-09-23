const express = require('express');

const diagnosticsController = require('../../controllers/diagnostics.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const { ingestionDiagnosticsQuerySchema } = require('../../schemas/diagnostics.schema');

const router = express.Router();

router.get('/ingestion', validateRequest({ query: ingestionDiagnosticsQuerySchema }), diagnosticsController.listIngestionDiagnostics);

module.exports = router;
