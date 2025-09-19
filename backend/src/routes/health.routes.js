const express = require('express');
const healthController = require('../controllers/health.controller');

const router = express.Router();

router.get('/', healthController.getHealth);

/**
 * @openapi
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     tags:
 *       - Health
 *     responses:
 *       '200':
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 meta:
 *                   type: object
 */
router.get('/live', healthController.getLiveness);

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     tags:
 *       - Health
 *     responses:
 *       '200':
 *         description: Application is ready to receive traffic
 */
router.get('/ready', healthController.getReadiness);

module.exports = router;
