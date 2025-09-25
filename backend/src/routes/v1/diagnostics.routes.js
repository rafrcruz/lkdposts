const express = require('express');

const diagnosticsController = require('../../controllers/diagnostics.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const { ingestionDiagnosticsQuerySchema } = require('../../schemas/diagnostics.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/diagnostics/ingestion:
 *   get:
 *     summary: List the most recent ingestion diagnostics
 *     description: Disponibiliza os últimos eventos registrados pelo pipeline de ingestão para análise operacional.
 *     tags:
 *       - Diagnostics
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Quantidade máxima de eventos retornados (padrão 20).
 *       - in: query
 *         name: feedId
 *         schema:
 *           type: integer
 *           nullable: true
 *         description: Filtra eventos associados ao feed informado.
 *     responses:
 *       '200':
 *         description: Eventos recentes do pipeline de ingestão
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/IngestionDiagnosticsList'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     items:
 *                       - itemId: 101
 *                         feedId: 1
 *                         feedTitle: Example Feed
 *                         itemTitle: Example item
 *                         canonicalUrl: https://example.com/item-101
 *                         publishedAt: '2025-01-20T10:00:00.000Z'
 *                         chosenSource: rss
 *                         rawDescriptionLength: 240
 *                         bodyHtmlRawLength: 1280
 *                         articleHtmlLength: 1100
 *                         hasBlockTags: true
 *                         looksEscapedHtml: false
 *                         weakContent: false
 *                         articleHtmlPreview: '<p>Example</p>'
 *                         recordedAt: '2025-01-20T10:01:30.000Z'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/ingestion', validateRequest({ query: ingestionDiagnosticsQuerySchema }), diagnosticsController.listIngestionDiagnostics);

module.exports = router;
