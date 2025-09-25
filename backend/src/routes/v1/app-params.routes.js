const express = require('express');
const appParamsController = require('../../controllers/app-params.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const { requireRole, ROLES } = require('../../middlewares/authorization');
const { updateAppParamsBodySchema } = require('../../schemas/app-params.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/app-params:
 *   get:
 *     summary: Retrieve application-wide parameters
 *     description: Retorna parâmetros globais utilizados por toda a aplicação, independentes do usuário autenticado.
 *     tags:
 *       - Application Parameters
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Parâmetros globais atuais
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AppParams'
 *             examples:
 *               default:
 *                 summary: Valores padrão
 *                 value:
 *                   success: true
 *                   data:
 *                     posts_refresh_cooldown_seconds: 3600
 *                     posts_time_window_days: 7
 *                     updated_at: '2025-01-20T12:34:56.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000000
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *   put:
 *     summary: Update application-wide parameters
 *     description: Permite que administradores atualizem um ou mais parâmetros globais.
 *     tags:
 *       - Application Parameters
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               posts_refresh_cooldown_seconds:
 *                 type: integer
 *                 minimum: 0
 *               posts_time_window_days:
 *                 type: integer
 *                 minimum: 1
 *           examples:
 *             updateCooldown:
 *               summary: Ajuste de cooldown
 *               value:
 *                 posts_refresh_cooldown_seconds: 1800
 *     responses:
 *       '200':
 *         description: Parâmetros atualizados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AppParams'
 *             examples:
 *               updated:
 *                 value:
 *                   success: true
 *                   data:
 *                     posts_refresh_cooldown_seconds: 1800
 *                     posts_time_window_days: 7
 *                     updated_at: '2025-01-21T09:15:00.000Z'
 *                     updated_by: admin@example.com
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000000
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '422':
 *         $ref: '#/components/responses/UnprocessableEntity'
 *   patch:
 *     summary: Partially update application-wide parameters
 *     tags:
 *       - Application Parameters
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               posts_refresh_cooldown_seconds:
 *                 type: integer
 *                 minimum: 0
 *               posts_time_window_days:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       '200':
 *         description: Parâmetros atualizados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AppParams'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '422':
 *         $ref: '#/components/responses/UnprocessableEntity'
 */
router.get('/', appParamsController.get);
router.put('/', requireRole(ROLES.ADMIN), validateRequest({ body: updateAppParamsBodySchema }), appParamsController.update);
router.patch('/', requireRole(ROLES.ADMIN), validateRequest({ body: updateAppParamsBodySchema }), appParamsController.update);

module.exports = router;
