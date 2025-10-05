const express = require('express');
const openAiController = require('../../../controllers/admin/openai.controller');

const router = express.Router();

/**
 * @openapi
 * /api/v1/admin/openai/diag:
 *   get:
 *     summary: Run a connectivity diagnostic against the OpenAI Responses API
 *     description: Executa uma chamada mínima para a OpenAI Responses API e retorna métricas de latência e eventuais erros.
 *     tags:
 *       - Admin - OpenAI
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *         description: Modelo OpenAI opcional a ser utilizado no diagnóstico. Quando ausente, usa o modelo configurado na aplicação.
 *     responses:
 *       '200':
 *         description: Resultado da execução do diagnóstico.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/OpenAiDiagnosticsResult'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     ok: true
 *                     model: gpt-5-nano
 *                     baseURL: https://api.openai.com/v1
 *                     timeoutMs: 30000
 *                     latencyMs: 842
 *                     usage:
 *                       total_tokens: 24
 *                       input_tokens: 12
 *                       output_tokens: 12
 *               failure:
 *                 value:
 *                   success: true
 *                   data:
 *                     ok: false
 *                     model: gpt-5-nano
 *                     baseURL: https://api.openai.com/v1
 *                     timeoutMs: 30000
 *                     latencyMs: 120
 *                     error:
 *                       status: 401
 *                       type: invalid_request_error
 *                       code: invalid_api_key
 *                       message: Invalid API key provided
 *                       request_id: req_abc123
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/diag', openAiController.runDiagnostics);

module.exports = router;
