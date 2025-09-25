const express = require('express');
const metricsController = require('../controllers/metrics.controller');

const router = express.Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Export Prometheus metrics
 *     description: Retorna as métricas coletadas em formato texto compatível com Prometheus.
 *     tags:
 *       - Observability
 *     responses:
 *       '200':
 *         description: Métricas atuais da aplicação
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *             example: |
 *               # HELP http_requests_total Total de requisições HTTP
 *               # TYPE http_requests_total counter
 *               http_requests_total{method="get",route="/health/live",status="200"} 42
 *       '404':
 *         description: Coleta de métricas desabilitada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorEnvelope'
 */
router.get('/', metricsController.getMetrics);

module.exports = router;
