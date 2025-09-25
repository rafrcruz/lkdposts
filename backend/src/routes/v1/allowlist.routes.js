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
 *           nullable: true
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
 *                       $ref: '#/components/schemas/AllowlistListResponse'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     items:
 *                       - id: 1
 *                         email: admin@example.com
 *                         role: admin
 *                         immutable: true
 *                         createdAt: '2025-01-10T12:00:00.000Z'
 *                         updatedAt: '2025-01-11T09:30:00.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000001
 *                     nextCursor: null
 *                     total: 1
 *                     limit: 20
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *   post:
 *     summary: Add a new user to the allowlist
 *     tags:
 *       - Allowlist
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AllowlistCreateRequest'
 *           examples:
 *             create:
 *               value:
 *                 email: editor@example.com
 *                 role: editor
 *     responses:
 *       '201':
 *         description: Usuário adicionado à allowlist
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AllowedUser'
 *             examples:
 *               created:
 *                 value:
 *                   success: true
 *                   data:
 *                     id: 2
 *                     email: editor@example.com
 *                     role: editor
 *                     immutable: false
 *                     createdAt: '2025-01-20T12:30:00.000Z'
 *                     updatedAt: '2025-01-20T12:30:00.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000002
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.get('/', validateRequest({ query: listAllowlistQuerySchema }), allowlistController.list);
router.post('/', validateRequest({ body: createAllowlistBodySchema }), allowlistController.create);

/**
 * @openapi
 * /api/v1/allowlist/{id}:
 *   patch:
 *     summary: Update the role of an allowlisted user
 *     tags:
 *       - Allowlist
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AllowlistUpdateRoleRequest'
 *           examples:
 *             update:
 *               value:
 *                 role: admin
 *     responses:
 *       '200':
 *         description: Papel atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AllowedUser'
 *             examples:
 *               updated:
 *                 value:
 *                   success: true
 *                   data:
 *                     id: 2
 *                     email: editor@example.com
 *                     role: admin
 *                     immutable: false
 *                     createdAt: '2025-01-20T12:30:00.000Z'
 *                     updatedAt: '2025-01-21T08:15:00.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000003
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *   delete:
 *     summary: Remove an allowlisted user
 *     tags:
 *       - Allowlist
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Usuário removido da allowlist
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AllowlistRemovalResult'
 *             examples:
 *               removed:
 *                 value:
 *                   success: true
 *                   data:
 *                     message: Allowlist entry removed
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000004
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/:id',
  validateRequest({ params: allowlistParamsSchema, body: updateAllowlistRoleBodySchema }),
  allowlistController.updateRole
);
router.delete('/:id', validateRequest({ params: allowlistParamsSchema }), allowlistController.remove);

module.exports = router;
