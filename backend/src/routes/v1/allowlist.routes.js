const express = require('express');
const allowlistController = require('../../controllers/allowlist.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const {
  listAllowlistQuerySchema,
  createAllowlistBodySchema,
  updateAllowlistRoleBodySchema,
  allowlistParamsSchema,
} = require('../../schemas/allowlist.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/allowlist:
 *   get:
 *     summary: List allowed users with pagination
 *     tags:
 *       - Allowlist
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: integer
 *         description: Cursor retornado em respostas anteriores para continuar a paginação.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Quantidade de registros por página (padrão 20, máximo 50).
 *     responses:
 *       '200':
 *         description: Lista paginada de usuários autorizados
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/AllowedUser'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         nextCursor:
 *                           type: integer
 *                           nullable: true
 *                         total:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', validateRequest({ query: listAllowlistQuerySchema }), allowlistController.list);
router.post('/', validateRequest({ body: createAllowlistBodySchema }), allowlistController.create);
router.patch(
  '/:id',
  validateRequest({ params: allowlistParamsSchema, body: updateAllowlistRoleBodySchema }),
  allowlistController.updateRole
);
router.delete('/:id', validateRequest({ params: allowlistParamsSchema }), allowlistController.remove);

module.exports = router;
