const express = require('express');
const newsGenerationController = require('../../../controllers/admin/news-generation.controller');
const { validateRequest } = require('../../../middlewares/validate-request');
const { previewPayloadQuerySchema } = require('../../../schemas/news.schema');

const router = express.Router();

/**
 * @openapi
 * /api/v1/admin/news/generate-posts:
 *   post:
 *     summary: Trigger manual post generation for the authenticated owner
 *     description: Inicia imediatamente a geração de posts para as notícias elegíveis do usuário autenticado.
 *     tags:
 *       - Admin - News Generation
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Geração executada com sucesso ou já em andamento.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AdminGenerationTriggerResult'
 *             examples:
 *               success:
 *                 value:
 *                   success: true
 *                   data:
 *                     ownerKey: '1'
 *                     summary:
 *                       ownerKey: '1'
 *                       startedAt: '2025-01-20T12:34:56.000Z'
 *                       finishedAt: '2025-01-20T12:35:45.000Z'
 *                       eligibleCount: 3
 *                       generatedCount: 2
 *                       failedCount: 1
 *                       skippedCount: 0
 *                       promptBaseHash: e3b0c44298fc1c149afbf4c8996fb924
 *                       modelUsed: gpt-5-nano
 *                       errors:
 *                         - articleId: 42
 *                           reason: OpenAI request timed out
 *                   meta:
 *                     requestId: 00000000-0000-4000-8000-000000000000
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/generate-posts', newsGenerationController.triggerGeneration);

/**
 * @openapi
 * /api/v1/admin/news/generation-status:
 *   get:
 *     summary: Retrieve the latest manual generation status
 *     description: Retorna o progresso mais recente da geração manual de posts iniciada via endpoint administrativo.
 *     tags:
 *       - Admin - News Generation
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     responses:
 *       '200':
 *         description: Status atual (ou nulo) da última execução manual.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AdminGenerationStatusResult'
 *             examples:
 *               running:
 *                 value:
 *                   success: true
 *                   data:
 *                     ownerKey: '1'
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
 *                       promptBaseHash: e3b0c44298fc1c149afbf4c8996fb924
 *                       modelUsed: gpt-5-nano
 *                       errors: []
 *                   meta:
 *                     requestId: 11111111-2222-4333-8444-555555555555
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/generation-status', newsGenerationController.getStatus);

/**
 * @openapi
 * /api/v1/admin/news/preview-payload:
 *   get:
 *     summary: Preview the payload that would be sent to OpenAI
 *     description: Monta o prompt concatenado e o payload de notícia que seria enviado para a OpenAI durante a geração manual.
 *     tags:
 *       - Admin - News Generation
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: news_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID da notícia a ser inspecionada. Quando omitido, utiliza a próxima notícia elegível.
 *     responses:
 *       '200':
 *         description: Preview construído com sucesso.
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
 *                     prompt_base_hash: e3b0c44298fc1c149afbf4c8996fb924
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
 *                           - type: input_text
 *                             text: |-
 *                               Notícia ID interno: 1
 *                               Feed: Feed principal · URL: https://example.com/rss.xml
 *                               Título: Notícia exemplo
 *                               Publicado em: 2025-01-20T12:00:00.000Z
 *                               Resumo: Resumo da notícia
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/preview-payload',
  validateRequest({ query: previewPayloadQuerySchema }),
  newsGenerationController.previewPayload,
);

/**
 * @openapi
 * /api/v1/admin/news/preview-openai:
 *   get:
 *     summary: Execute the OpenAI probe with the current configuration
 *     description: Executa uma chamada direta para a OpenAI Responses API e retorna a resposta bruta para inspeção.
 *     tags:
 *       - Admin - News Generation
 *     security:
 *       - SessionCookie: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: news_id
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID da notícia alvo. Quando ausente, utiliza a próxima notícia elegível.
 *     responses:
 *       '200':
 *         description: Resposta retornada pela OpenAI.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Estrutura original devolvida pela Responses API da OpenAI.
 *             examples:
 *               openaiResponse:
 *                 value:
 *                   id: resp_1234567890
 *                   model: gpt-5-nano
 *                   created: 1737136800
 *                   response:
 *                     - role: assistant
 *                       content:
 *                         - type: output_text
 *                           text: 'Exemplo de post gerado.'
 *                   usage:
 *                     total_tokens: 240
 *                     input_tokens: 160
 *                     output_tokens: 80
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       default:
 *         description: Erro propagado diretamente pela OpenAI.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get(
  '/preview-openai',
  validateRequest({ query: previewPayloadQuerySchema }),
  newsGenerationController.previewOpenAI,
);

module.exports = router;

