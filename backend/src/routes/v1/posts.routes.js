const express = require('express');

const postsController = require('../../controllers/posts.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const { listPostsQuerySchema } = require('../../schemas/posts.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/posts/refresh:
 *   post:
 *     summary: Refresh articles and generate posts from configured feeds
 *     description: Consulta todos os feeds do usuário autenticado, aplica a janela de retenção configurada e cria posts placeholder para notícias recentes.
 *     tags:
 *       - Posts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Refresh executed for every feed owned by the user
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/FeedRefreshResponse'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     now: '2025-01-20T12:34:56.000Z'
 *                     feeds:
 *                       - feedId: 1
 *                         feedUrl: https://example.com/rss.xml
 *                         feedTitle: Example RSS
 *                         skippedByCooldown: false
 *                         cooldownSecondsRemaining: 0
 *                         itemsRead: 12
 *                         itemsWithinWindow: 4
 *                         articlesCreated: 2
 *                         duplicates: 1
 *                         invalidItems: 0
 *                         error: null
 *                       - feedId: 2
 *                         feedUrl: https://news.example.com/feed
 *                         feedTitle: null
 *                         skippedByCooldown: true
 *                         cooldownSecondsRemaining: 1800
 *                         itemsRead: 0
 *                         itemsWithinWindow: 0
 *                         articlesCreated: 0
 *                         duplicates: 0
 *                         invalidItems: 0
 *                         error:
 *                           message: Feed request timed out
 *                   meta:
 *                     requestId: 77777777-8888-4999-8aaa-bbbbbbbbbbbb
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/posts/refresh', postsController.refresh);

/**
 * @openapi
 * /api/v1/posts/cleanup:
 *   post:
 *     summary: Delete old articles and posts outside the retention window
 *     description: Remove artigos e posts vinculados aos feeds do usuário autenticado que estejam fora da janela de 7 dias utilizada pelo sistema.
 *     tags:
 *       - Posts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Cleanup executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PostsCleanupResult'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     removedArticles: 6
 *                     removedPosts: 6
 *                   meta:
 *                     requestId: 12345678-90ab-4cde-8fab-1234567890ab
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/posts/cleanup', postsController.cleanup);

/**
 * @openapi
 * /api/v1/posts:
 *   get:
 *     summary: List generated posts derived from recent feed entries
 *     description: Retorna artigos normalizados com o conteúdo de post correspondente, aplicando ordenação decrescente por data e paginação por cursor.
 *     tags:
 *       - Posts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor de paginação retornado em chamadas anteriores.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Quantidade de itens por página (padrão 20, máximo 50).
 *       - in: query
 *         name: feedId
 *         schema:
 *           type: integer
 *         description: Filtra os artigos pertencentes ao feed informado.
 *     responses:
 *       '200':
 *         description: Paginated list of recent posts
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PostListResponse'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         requestId:
 *                           type: string
 *                           format: uuid
 *                         nextCursor:
 *                           type: ['string', 'null']
 *                           description: Cursor para a próxima página ou null ao final da lista.
 *                         limit:
 *                           type: integer
 *                           description: Limite aplicado à consulta.
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     items:
 *                       - id: 101
 *                         title: Nova parceria anunciada
 *                         contentSnippet: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
 *                         publishedAt: '2025-01-20T09:00:00.000Z'
 *                         feed:
 *                           id: 1
 *                           title: Example RSS
 *                           url: https://example.com/rss.xml
 *                         post:
 *                           content: Lorem ipsum dolor sit amet, consectetur adipiscing elit.
 *                           createdAt: '2025-01-20T12:35:00.000Z'
 *                       - id: 102
 *                         title: Tech Weekly 42
 *                         contentSnippet: Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
 *                         publishedAt: '2025-01-19T17:30:00.000Z'
 *                         feed:
 *                           id: 2
 *                           title: null
 *                           url: https://news.example.com/feed
 *                         post: null
 *                   meta:
 *                     requestId: 55555555-6666-4777-8888-999999999999
 *                     nextCursor: MjAyNS0wMS0xOVQxNzozMDowMC4wMDBaOjEwMg==
 *                     limit: 20
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/posts', validateRequest({ query: listPostsQuerySchema }), postsController.list);

module.exports = router;
