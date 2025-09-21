const express = require('express');
const feedController = require('../../controllers/feed.controller');

const router = express.Router();

/**
 * @openapi
 * /api/v1/feeds:
 *   get:
 *     summary: List RSS feeds owned by the authenticated user
 *     description: Retorna os feeds cadastrados pelo usuário autenticado usando envelope padronizado e paginação baseada em cursor.
 *     tags:
 *       - Feeds
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor retornado em chamadas anteriores para continuar a paginação.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Quantidade máxima de feeds retornados por página (padrão 20, limite 50).
 *     responses:
 *       '200':
 *         description: Paginated list of feeds
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
 *                             $ref: '#/components/schemas/Feed'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         requestId:
 *                           type: string
 *                           format: uuid
 *                         nextCursor:
 *                           type: ['string', 'null']
 *                           description: Cursor da próxima página ou null quando não há mais resultados.
 *                         total:
 *                           type: integer
 *                           description: Total de feeds cadastrados para o usuário.
 *                         limit:
 *                           type: integer
 *                           description: Limite efetivamente aplicado.
 *             examples:
 *               success:
 *                 summary: Lista paginada de feeds
 *                 value:
 *                   success: true
 *                   data:
 *                     items:
 *                       - id: 1
 *                         url: https://example.com/rss.xml
 *                         title: Example RSS
 *                         lastFetchedAt: '2025-01-20T12:00:00.000Z'
 *                         createdAt: '2025-01-10T09:30:00.000Z'
 *                         updatedAt: '2025-01-18T08:15:00.000Z'
 *                   meta:
 *                     requestId: 11111111-2222-4333-8444-555555555555
 *                     nextCursor: '2'
 *                     total: 3
 *                     limit: 20
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     summary: Create a new RSS feed for the authenticated user
 *     description: Registra um novo feed RSS associado ao usuário autenticado. URLs duplicadas são rejeitadas.
 *     tags:
 *       - Feeds
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               title:
 *                 type: string
 *                 nullable: true
 *           examples:
 *             minimal:
 *               summary: Criação básica
 *               value:
 *                 url: https://example.com/rss.xml
 *             withTitle:
 *               summary: Incluindo título opcional
 *               value:
 *                 url: https://example.com/rss.xml
 *                 title: Example RSS Feed
 *     responses:
 *       '201':
 *         description: Feed created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Feed'
 *             examples:
 *               created:
 *                 value:
 *                   success: true
 *                   data:
 *                     id: 4
 *                     url: https://example.com/rss.xml
 *                     title: Example RSS Feed
 *                     lastFetchedAt: null
 *                     createdAt: '2025-01-20T12:34:56.000Z'
 *                     updatedAt: '2025-01-20T12:34:56.000Z'
 *                   meta:
 *                     requestId: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
*/
router.get('/feeds', feedController.list);
router.post('/feeds', feedController.create);

/**
 * @openapi
 * /api/v1/feeds/bulk:
 *   post:
 *     summary: Create multiple RSS feeds in a single request
 *     description: Recebe até 25 URLs por requisição, ignorando duplicadas e reportando entradas inválidas sem interromper o processamento.
 *     tags:
 *       - Feeds
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *           examples:
 *             sample:
 *               value:
 *                 urls:
 *                   - https://example.com/rss.xml
 *                   - https://news.example.com/feed
 *     responses:
 *       '200':
 *         description: Result of the bulk creation request
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/FeedBulkResult'
 *             examples:
 *               processed:
 *                 value:
 *                   success: true
 *                   data:
 *                     created:
 *                       - id: 5
 *                         url: https://example.com/rss.xml
 *                         title: null
 *                         lastFetchedAt: null
 *                         createdAt: '2025-01-20T12:34:56.000Z'
 *                         updatedAt: '2025-01-20T12:34:56.000Z'
 *                     duplicates:
 *                       - url: https://example.com/rss.xml
 *                         reason: ALREADY_EXISTS
 *                         feedId: 2
 *                       - url: https://example.com/rss.xml
 *                         reason: DUPLICATE_IN_PAYLOAD
 *                         feedId: null
 *                     invalid:
 *                       - url: notaurl
 *                         reason: INVALID_URL
 *                       - url: ''
 *                         reason: URL_REQUIRED
 *                   meta:
 *                     requestId: 11111111-2222-4333-8444-555555555555
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '413':
 *         $ref: '#/components/responses/PayloadTooLarge'
 */
router.post('/feeds/bulk', feedController.bulkCreate);

/**
 * @openapi
 * /api/v1/feeds/{id}:
 *   patch:
 *     summary: Update attributes of an existing feed
 *     description: Permite atualizar URL e título de um feed pertencente ao usuário autenticado.
 *     tags:
 *       - Feeds
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
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               title:
 *                 type: string
 *                 nullable: true
 *           examples:
 *             updateTitle:
 *               value:
 *                 title: Novo título
 *             updateUrl:
 *               value:
 *                 url: https://example.com/rss.xml
 *     responses:
 *       '200':
 *         description: Feed updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Feed'
 *             examples:
 *               updated:
 *                 value:
 *                   success: true
 *                   data:
 *                     id: 2
 *                     url: https://example.com/rss.xml
 *                     title: Novo título
 *                     lastFetchedAt: '2025-01-18T08:15:00.000Z'
 *                     createdAt: '2024-12-01T12:00:00.000Z'
 *                     updatedAt: '2025-01-20T12:40:00.000Z'
 *                   meta:
 *                     requestId: 99999999-8888-4777-8666-555555555555
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 *   delete:
 *     summary: Remove a feed owned by the authenticated user
 *     description: Exclui definitivamente o feed informado e os dados associados ao usuário autenticado.
 *     tags:
 *       - Feeds
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
 *         description: Feed removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/FeedDeletionResult'
 *             examples:
 *               removed:
 *                 value:
 *                   success: true
 *                   data:
 *                     message: Feed removed
 *                   meta:
 *                     requestId: 22222222-3333-4444-8555-666666666666
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/feeds/:id', feedController.update);
router.delete('/feeds/:id', feedController.remove);

module.exports = router;
