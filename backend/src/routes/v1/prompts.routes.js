const express = require('express');
const promptsController = require('../../controllers/prompts.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const {
  promptListQuerySchema,
  promptCreateSchema,
  promptIdParamSchema,
  promptUpdateSchema,
  promptReorderSchema,
} = require('../../schemas/prompts.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/prompts:
 *   get:
 *     summary: List prompts owned by the authenticated user
 *     description: Returns the list of saved prompts ordered by ascending position.
 *     tags:
 *       - Prompts
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
 *         required: false
 *         description: Maximum number of prompts to return (default 50).
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         required: false
 *         description: Number of prompts to skip before collecting the result set.
 *     responses:
 *       '200':
 *         description: List of prompts for the authenticated user
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
 *                             $ref: '#/components/schemas/Prompt'
 *                   required:
 *                     - data
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     items:
 *                       - id: '3f4c9f4d-1ce5-4a4b-95f5-1234567890ab'
 *                         title: Mensagem inicial
 *                         content: Conteúdo do prompt
 *                         position: 0
 *                         createdAt: '2025-01-20T12:34:56.000Z'
 *                         updatedAt: '2025-01-20T12:34:56.000Z'
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000000
 *                     total: 1
 *                     limit: 50
 *                     offset: 0
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/prompts', validateRequest({ query: promptListQuerySchema }), promptsController.list);

/**
 * @openapi
 * /api/v1/prompts:
 *   post:
 *     summary: Create a new prompt
 *     description: Creates a prompt scoped to the authenticated user.
 *     tags:
 *       - Prompts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PromptCreate'
 *           examples:
 *             create:
 *               value:
 *                 title: Nova ideia
 *                 content: Texto do prompt
 *     responses:
 *       '201':
 *         description: Prompt successfully created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Prompt'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/prompts', validateRequest({ body: promptCreateSchema }), promptsController.create);

/**
 * @openapi
 * /api/v1/prompts/{id}:
 *   get:
 *     summary: Retrieve a prompt by id
 *     description: Returns the prompt only if it belongs to the authenticated user.
 *     tags:
 *       - Prompts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: Prompt identifier
 *     responses:
 *       '200':
 *         description: Prompt details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Prompt'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/prompts/:id', validateRequest({ params: promptIdParamSchema }), promptsController.getById);

/**
 * @openapi
 * /api/v1/prompts/{id}:
 *   patch:
 *     summary: Update a prompt
 *     description: Allows changing the title or content of a prompt. Position changes must use the reorder endpoint.
 *     tags:
 *       - Prompts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PromptUpdate'
 *           examples:
 *             update:
 *               value:
 *                 title: Título atualizado
 *                 content: Novo conteúdo
 *     responses:
 *       '200':
 *         description: Prompt updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Prompt'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch(
  '/prompts/:id',
  validateRequest({ params: promptIdParamSchema, body: promptUpdateSchema }),
  promptsController.update
);

/**
 * @openapi
 * /api/v1/prompts/{id}:
 *   delete:
 *     summary: Delete a prompt
 *     description: Removes the prompt belonging to the authenticated user.
 *     tags:
 *       - Prompts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *     responses:
 *       '204':
 *         description: Prompt deleted successfully
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/prompts/:id', validateRequest({ params: promptIdParamSchema }), promptsController.remove);

/**
 * @openapi
 * /api/v1/prompts/reorder:
 *   put:
 *     summary: Reorder prompts in bulk
 *     description: Applies the provided positions to the prompts owned by the authenticated user in a single transaction.
 *     tags:
 *       - Prompts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PromptReorderRequest'
 *           examples:
 *             reorder:
 *               value:
 *                 items:
 *                   - id: '3f4c9f4d-1ce5-4a4b-95f5-1234567890ab'
 *                     position: 1
 *                   - id: '8b50f7cd-2f26-4c8c-9b10-abcdefabcdef'
 *                     position: 0
 *     responses:
 *       '200':
 *         description: Updated ordered list of prompts
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
 *                             $ref: '#/components/schemas/Prompt'
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/prompts/reorder', validateRequest({ body: promptReorderSchema }), promptsController.reorder);

module.exports = router;
