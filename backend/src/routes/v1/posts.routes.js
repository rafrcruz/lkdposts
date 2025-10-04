const express = require('express');

const postsController = require('../../controllers/posts.controller');
const newsGenerationController = require('../../controllers/admin/news-generation.controller');
const { validateRequest } = require('../../middlewares/validate-request');
const { listPostsQuerySchema } = require('../../schemas/posts.schema');
const { previewPayloadQuerySchema } = require('../../schemas/news.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/posts/refresh:
 *   post:
 *     summary: Refresh articles and generate posts from configured feeds
 *     description: Consulta todos os feeds do usuário autenticado, aplica a janela de retenção configurada e aciona a geração de posts para notícias recentes utilizando os prompts habilitados.
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
 *                     generation:
 *                       ownerKey: '1'
 *                       startedAt: '2025-01-20T12:34:56.000Z'
 *                       finishedAt: '2025-01-20T12:34:57.000Z'
 *                       eligibleCount: 2
 *                       generatedCount: 2
 *                       failedCount: 0
 *                       skippedCount: 1
 *                       promptBaseHash: 'e3b0c44298fc1c149afbf4c8996fb924'
 *                       modelUsed: gpt-5-nano
 *                       errors: null
 *                   meta:
 *                     requestId: 77777777-8888-4999-8aaa-bbbbbbbbbbbb
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/posts/refresh', postsController.refresh);

/**
 * @openapi
 * /api/v1/posts/refresh-status:
 *   get:
 *     summary: Get the latest refresh progress for the authenticated user
 *     description: Retorna o progresso mais recente da geração de posts para o usuário autenticado.
 *     tags:
 *       - Posts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Último status conhecido da geração de posts
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
 *                         status:
 *                           $ref: '#/components/schemas/PostGenerationProgress'
 *             examples:
 *               progress:
 *                 value:
 *                   success: true
 *                   data:
 *                     status:
 *                       ownerKey: '1'
 *                       startedAt: '2025-01-20T12:34:56.000Z'
 *                       updatedAt: '2025-01-20T12:35:10.000Z'
 *                       finishedAt: null
 *                       status: in_progress
 *                       phase: generating_posts
 *                       message: 'Gerando post 2 de 5...'
 *                       eligibleCount: 5
 *                       processedCount: 1
 *                       generatedCount: 1
 *                       failedCount: 0
 *                       skippedCount: 0
 *                       currentArticleId: 42
 *                       currentArticleTitle: 'Exemplo de notícia'
 *                       promptBaseHash: 'e3b0c44298fc1c149afbf4c8996fb924'
 *                       modelUsed: gpt-5-nano
 *                       errors: []
 *                   meta:
 *                     requestId: 11111111-2222-4333-8444-555555555555
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/posts/refresh-status', postsController.refreshStatus);

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
 * /api/v1/posts/preview-payload:
 *   get:
 *     summary: Build the prompt payload for the next eligible news article
 *     description: Retorna os prompts concatenados e o payload de notícia que seria enviado para a IA na próxima geração.
 *     tags:
 *       - Posts
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: news_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID da notícia desejada. Quando omitido, seleciona a próxima notícia elegível automaticamente.
 *     responses:
 *       '200':
 *         description: Preview gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PostRequestPreview'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     prompt_base: |-
 *                       Titulo A
 *
 *                       Conteudo A
 *
 *                       Instrução final: gerar um post para LinkedIn com base na notícia e no contexto acima.
 *                     prompt_base_hash: e3b0c44298fc1b...
 *                     model: gpt-5-nano
 *                     news_payload:
 *                       article:
 *                         id: 1
 *                         title: Notícia exemplo
 *                         contentSnippet: Resumo da notícia
 *                         articleHtml: '<p>Notícia</p>'
 *                         link: https://example.com/noticia
 *                         guid: guid-1
 *                         publishedAt: '2025-01-20T12:00:00.000Z'
 *                         feed:
 *                           id: 1
 *                           title: Feed principal
 *                           url: https://example.com/rss.xml
 *                       message:
 *                         role: user
 *                         content:
 *                           - type: text
 *                             text: |
 *                               Notícia ID interno: 1
 *                               Feed: Feed principal · URL: https://example.com/rss.xml
 *                               Título: Notícia exemplo
 *                               Publicado em: 2025-01-20T12:00:00.000Z
 *                               Resumo: Resumo da notícia
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000000
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  '/posts/preview-payload',
  validateRequest({ query: previewPayloadQuerySchema }),
  newsGenerationController.previewPayload,
);

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
