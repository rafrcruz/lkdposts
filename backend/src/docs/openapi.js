const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');
const { ROLES } = require('../constants/roles');

const allowedRoles = Object.values(ROLES);

const definition = {
  openapi: '3.1.0',
  info: {
    title: 'lkdposts API',
    version: '1.0.0',
    description: 'API responsável por disponibilizar funcionalidades de automação de posts.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1',
    },
  ],
  components: {
    schemas: {
      Envelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: ['object', 'null'] },
          meta: {
            type: 'object',
            properties: {
              requestId: {
                type: 'string',
                format: 'uuid',
                example: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'INTERNAL_SERVER_ERROR' },
              message: { type: 'string', example: 'Internal server error' },
              details: { type: ['object', 'null'], example: null },
            },
          },
          meta: {
            type: 'object',
            properties: {
              requestId: {
                type: 'string',
                format: 'uuid',
                example: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      Feed: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          url: { type: 'string', format: 'uri', example: 'https://example.com/rss.xml' },
          title: { type: ['string', 'null'], example: 'My RSS feed' },
          lastFetchedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: null,
          },
          createdAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
        },
      },
      AllowedUser: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'admin@example.com' },
          role: {
            type: 'string',
            enum: allowedRoles,
            example: allowedRoles[0],
          },
          immutable: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
        },
      },
      AppParams: {
        type: 'object',
        properties: {
          posts_refresh_cooldown_seconds: { type: 'integer', minimum: 0, example: 3600 },
          posts_time_window_days: { type: 'integer', minimum: 1, example: 7 },
          'openai.model': {
            type: 'string',
            enum: [
              'gpt-5-nano',
              'gpt-5-mini',
              'gpt-5',
              'gpt-5-nano-2025-08-07',
              'gpt-5-mini-2025-08-07',
              'gpt-5-2025-08-07',
            ],
            example: 'gpt-5-nano',
            description: 'Identificador do modelo OpenAI usado para gerar os posts.',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T12:34:56.000Z',
          },
          updated_by: { type: ['string', 'null'], example: 'admin@example.com' },
        },
      },
      AllowlistListResponse: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/AllowedUser' },
          },
        },
      },
      AllowlistCreateRequest: {
        type: 'object',
        required: ['email', 'role'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          role: {
            type: 'string',
            enum: allowedRoles,
            example: allowedRoles[1],
          },
        },
      },
      AllowlistUpdateRoleRequest: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: allowedRoles,
            example: allowedRoles[0],
          },
        },
      },
      AllowlistRemovalResult: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Allowlist entry removed' },
        },
      },
      AuthGoogleLoginRequest: {
        type: 'object',
        required: ['idToken'],
        properties: {
          idToken: {
            type: 'string',
            description: 'Google ID token obtained from the client SDK.',
            example: 'ya29.a0AfH6SMCg...',
          },
        },
      },
      AuthSession: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          role: {
            type: 'string',
            enum: allowedRoles,
            example: allowedRoles[1],
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T13:45:00.000Z',
          },
        },
      },
      AuthLogoutResult: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Logged out' },
        },
      },
      AuthDebugReport: {
        type: 'object',
        properties: {
          origin: {
            type: ['string', 'null'],
            example: 'https://app.example.com',
          },
          hasCookie: { type: 'boolean', example: true },
          cookieNames: {
            type: 'array',
            items: { type: 'string' },
            example: ['lkdposts_session'],
          },
          authenticated: { type: 'boolean', example: true },
          userIdOrEmail: {
            type: ['string', 'null'],
            example: 'user@example.com',
          },
          release: {
            type: ['string', 'null'],
            example: '2025.01.20-abcdef',
          },
        },
      },
      Prompt: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '3f4c9f4d-1ce5-4a4b-95f5-1234567890ab' },
          title: { type: 'string', example: 'Ideias para post semanal' },
          content: {
            type: 'string',
            example: 'Descrever principais aprendizados da sprint.',
          },
          position: { type: 'integer', example: 0 },
          enabled: { type: 'boolean', example: true },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T12:34:56.000Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T12:34:56.000Z',
          },
        },
      },
      PromptCreate: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120, example: 'Nova ideia' },
          content: {
            type: 'string',
            example: 'Conteúdo do prompt que será usado em um post futuro.',
          },
          position: {
            type: 'integer',
            minimum: 0,
            description: 'Posição opcional do novo prompt (0-based). Se omitido, é adicionado ao final.',
          },
          enabled: {
            type: 'boolean',
            description: 'Define se o prompt inicia habilitado (padrão: true).',
          },
        },
      },
      PromptUpdate: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            example: 'Título atualizado',
          },
          content: {
            type: 'string',
            example: 'Novo conteúdo do prompt.',
          },
          enabled: {
            type: 'boolean',
            description: 'Atualiza o estado habilitado do prompt.',
          },
        },
      },
      PromptReorderItem: {
        type: 'object',
        required: ['id', 'position'],
        properties: {
          id: { type: 'string', format: 'uuid', example: '3f4c9f4d-1ce5-4a4b-95f5-1234567890ab' },
          position: { type: 'integer', minimum: 0, example: 1 },
        },
      },
      PromptReorderRequest: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/PromptReorderItem' },
            minItems: 1,
          },
        },
      },
      FeedDuplicateEntry: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', example: 'https://example.com/rss.xml' },
          reason: {
            type: 'string',
            example: 'ALREADY_EXISTS',
            description: 'Reason why the URL could not be created.',
          },
          feedId: {
            type: ['integer', 'null'],
            example: 12,
            description: 'Existing feed identifier when the duplicate already exists in the database.',
          },
        },
      },
      FeedInvalidEntry: {
        type: 'object',
        properties: {
          url: { type: 'string', example: 'notaurl' },
          reason: {
            type: 'string',
            example: 'INVALID_URL',
            description: 'Validation reason for rejecting the URL.',
          },
        },
      },
      FeedBulkResult: {
        type: 'object',
        properties: {
          created: {
            type: 'array',
            description: 'Feeds successfully created for the user.',
            items: { $ref: '#/components/schemas/Feed' },
          },
          duplicates: {
            type: 'array',
            description: 'URLs skipped because they already exist or were repeated in the payload.',
            items: { $ref: '#/components/schemas/FeedDuplicateEntry' },
          },
          invalid: {
            type: 'array',
            description: 'URLs rejected due to validation errors.',
            items: { $ref: '#/components/schemas/FeedInvalidEntry' },
          },
        },
      },
      FeedDeletionResult: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Feed removed' },
        },
      },
      FeedResetResult: {
        type: 'object',
        properties: {
          feedsResetCount: { type: 'integer', example: 12 },
          articlesDeletedCount: { type: 'integer', example: 480 },
          postsDeletedCount: { type: 'integer', example: 480 },
          durationMs: { type: 'integer', example: 85 },
        },
      },
      FeedRefreshSummary: {
        type: 'object',
        properties: {
          feedId: { type: 'integer', example: 42 },
          feedUrl: {
            type: 'string',
            format: 'uri',
            example: 'https://news.example.com/rss',
          },
          feedTitle: { type: ['string', 'null'], example: 'News' },
          skippedByCooldown: { type: 'boolean', example: false },
          cooldownSecondsRemaining: { type: 'integer', example: 0 },
          itemsRead: { type: 'integer', example: 25 },
          itemsWithinWindow: { type: 'integer', example: 8 },
          articlesCreated: { type: 'integer', example: 3 },
          duplicates: { type: 'integer', example: 2 },
          invalidItems: { type: 'integer', example: 1 },
          error: {
            type: ['object', 'null'],
            example: null,
            properties: {
              message: { type: 'string', example: 'Feed request timed out' },
            },
            description:
              'Error returned when the feed fetch failed. Null when the refresh completed successfully.',
          },
        },
      },
      FeedRefreshResponse: {
        type: 'object',
        properties: {
          now: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T12:34:56.000Z',
          },
          feeds: {
            type: 'array',
            items: { $ref: '#/components/schemas/FeedRefreshSummary' },
          },
          generation: {
            oneOf: [
              { $ref: '#/components/schemas/PostGenerationSummary' },
              { type: 'null' },
            ],
            description: 'Resumo da última geração de posts executada durante o refresh.',
          },
        },
      },
      PostGenerationErrorEntry: {
        type: 'object',
        properties: {
          articleId: {
            type: ['integer', 'null'],
            example: 123,
            description: 'Identificador interno do artigo associado ao erro, quando disponível.',
          },
          reason: {
            type: 'string',
            example: 'OpenAI request timed out',
          },
        },
      },
      PostGenerationSummary: {
        type: 'object',
        properties: {
          ownerKey: { type: 'string', example: '1' },
          startedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
          finishedAt: { type: ['string', 'null'], format: 'date-time', example: '2025-01-20T12:34:57.000Z' },
          eligibleCount: { type: 'integer', example: 3 },
          generatedCount: { type: 'integer', example: 2 },
          failedCount: { type: 'integer', example: 1 },
          skippedCount: { type: 'integer', example: 4 },
          promptBaseHash: { type: ['string', 'null'], example: 'e3b0c44298fc1c149afbf4c8996fb924' },
          modelUsed: { type: ['string', 'null'], example: 'gpt-5-nano' },
          errors: {
            type: ['array', 'null'],
            items: { $ref: '#/components/schemas/PostGenerationErrorEntry' },
          },
        },
      },
      PostGenerationProgress: {
        type: 'object',
        nullable: true,
        properties: {
          ownerKey: { type: 'string', example: '1' },
          startedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:35:10.000Z' },
          finishedAt: { type: ['string', 'null'], format: 'date-time', example: null },
          status: {
            type: 'string',
            enum: ['idle', 'in_progress', 'completed', 'failed'],
            example: 'in_progress',
          },
          phase: {
            type: 'string',
            enum: [
              'initializing',
              'resolving_params',
              'loading_prompts',
              'collecting_articles',
              'generating_posts',
              'finalizing',
              'completed',
              'failed',
            ],
            example: 'generating_posts',
          },
          message: {
            type: ['string', 'null'],
            example: 'Gerando post 2 de 5...'
          },
          eligibleCount: { type: ['integer', 'null'], example: 5 },
          processedCount: { type: 'integer', example: 2 },
          generatedCount: { type: 'integer', example: 2 },
          failedCount: { type: 'integer', example: 0 },
          skippedCount: { type: 'integer', example: 1 },
          currentArticleId: { type: ['integer', 'null'], example: 42 },
          currentArticleTitle: { type: ['string', 'null'], example: 'Exemplo de notícia' },
          promptBaseHash: { type: ['string', 'null'], example: 'e3b0c44298fc1c149afbf4c8996fb924' },
          modelUsed: { type: ['string', 'null'], example: 'gpt-5-nano' },
          errors: {
            type: 'array',
            items: { $ref: '#/components/schemas/PostGenerationErrorEntry' },
          },
          cacheInfo: {
            type: ['object', 'null'],
            properties: {
              cachedTokens: { type: 'integer', example: 1200 },
            },
            example: { cachedTokens: 1200 },
          },
          summary: {
            oneOf: [
              { $ref: '#/components/schemas/PostGenerationSummary' },
              { type: 'null' },
            ],
            description: 'Resumo final da última execução, quando disponível.',
          },
        },
      },
      PostsCleanupResult: {
        type: 'object',
        properties: {
          removedArticles: { type: 'integer', example: 12 },
          removedPosts: { type: 'integer', example: 12 },
        },
      },
      PostFeedReference: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 7 },
          title: { type: ['string', 'null'], example: 'Tech Newsletter' },
          url: {
            type: ['string', 'null'],
            format: 'uri',
            example: 'https://tech.example.com/rss',
          },
        },
      },
      PostContent: {
        type: 'object',
        properties: {
          content: {
            type: ['string', 'null'],
            example: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          },
          createdAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T12:35:30.000Z',
          },
          status: {
            type: ['string', 'null'],
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
            example: 'SUCCESS',
          },
          generatedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T12:35:45.000Z',
          },
          modelUsed: { type: ['string', 'null'], example: 'gpt-5-nano' },
          errorReason: { type: ['string', 'null'], example: null },
          tokensInput: { type: ['integer', 'null'], example: 120 },
          tokensOutput: { type: ['integer', 'null'], example: 90 },
          promptBaseHash: {
            type: ['string', 'null'],
            example: 'e3b0c44298fc1c149afbf4c8996fb924',
          },
          attemptCount: { type: 'integer', example: 1 },
          updatedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T12:35:45.000Z',
          },
        },
      },
      PostListItem: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 99 },
          title: { type: 'string', example: 'Latest tech news' },
          contentSnippet: {
            type: 'string',
            example: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          },
          publishedAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-01-20T10:00:00.000Z',
          },
          feed: {
            type: ['object', 'null'],
            allOf: [{ $ref: '#/components/schemas/PostFeedReference' }],
            example: { id: 7, title: 'Tech Newsletter', url: 'https://tech.example.com/rss' },
          },
          post: {
            type: ['object', 'null'],
            allOf: [{ $ref: '#/components/schemas/PostContent' }],
            example: {
              content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              createdAt: '2025-01-20T12:36:00.000Z',
            },
          },
        },
      },
      PostListResponse: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/PostListItem' },
          },
        },
      },
      IngestionDiagnosticEntry: {
        type: 'object',
        properties: {
          itemId: { type: ['integer', 'null'], example: 101 },
          feedId: { type: ['integer', 'null'], example: 1 },
          feedTitle: { type: ['string', 'null'], example: 'Example Feed' },
          itemTitle: { type: ['string', 'null'], example: 'Example item' },
          canonicalUrl: {
            type: ['string', 'null'],
            format: 'uri',
            example: 'https://example.com/item-101',
          },
          publishedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T10:00:00.000Z',
          },
          chosenSource: { type: ['string', 'null'], example: 'rss' },
          rawDescriptionLength: { type: ['integer', 'null'], example: 240 },
          bodyHtmlRawLength: { type: ['integer', 'null'], example: 1280 },
          articleHtmlLength: { type: ['integer', 'null'], example: 1100 },
          hasBlockTags: { type: ['boolean', 'null'], example: true },
          looksEscapedHtml: { type: ['boolean', 'null'], example: false },
          weakContent: { type: ['boolean', 'null'], example: false },
          articleHtmlPreview: { type: ['string', 'null'], example: '<p>Example</p>' },
          recordedAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T10:01:30.000Z',
          },
        },
      },
      IngestionDiagnosticsList: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/IngestionDiagnosticEntry' },
          },
        },
      },
    },
    securitySchemes: {
      SessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: config.auth.session.cookieName,
        description: 'Sessão autenticada emitida após login com Google.',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Session token',
        description: 'Token de sessão transmitido via cabeçalho Authorization.',
      },
    },
    responses: {
      BadRequest: {
        description: 'Requisição inválida (parâmetros ou payload incorretos).',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            examples: {
              invalidInput: {
                summary: 'Valor inválido informado',
                value: {
                  success: false,
                  error: {
                    code: 'INVALID_INPUT',
                    message: 'Invalid input data',
                  },
                  meta: {
                    requestId: '00000000-0000-4000-8000-000000000000',
                  },
                },
              },
              urlRequired: {
                summary: 'URL obrigatória',
                value: {
                  success: false,
                  error: {
                    code: 'URL_REQUIRED',
                    message: 'URL is required',
                  },
                  meta: {
                    requestId: '00000000-0000-4000-8000-000000000000',
                  },
                },
              },
              invalidCursor: {
                summary: 'Cursor de paginação inválido',
                value: {
                  success: false,
                  error: {
                    code: 'INVALID_CURSOR',
                    message: 'Invalid pagination cursor',
                  },
                  meta: {
                    requestId: '00000000-0000-4000-8000-000000000000',
                  },
                },
              },
            },
          },
        },
      },
      Unauthorized: {
        description: 'Autenticação requerida.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'UNAUTHENTICATED',
                message: 'Authentication required',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      Forbidden: {
        description: 'Usuário autenticado sem permissão suficiente.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      NotFound: {
        description: 'Recurso não encontrado.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'FEED_NOT_FOUND',
                message: 'Feed not found',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      Conflict: {
        description: 'Estado atual do recurso impede a operação.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'FEED_ALREADY_EXISTS',
                message: 'Feed already exists for this user',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      PayloadTooLarge: {
        description: 'Carga enviada excede os limites da API.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'A maximum of 25 feeds can be created per request',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
      UnprocessableEntity: {
        description: 'A requisição foi bem formada, mas viola regras de negócio.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
            example: {
              success: false,
              error: {
                code: 'POSTS_TIME_WINDOW_DAYS_TOO_LOW',
                message: 'posts_time_window_days must be greater than or equal to 1',
              },
              meta: {
                requestId: '00000000-0000-4000-8000-000000000000',
              },
            },
          },
        },
      },
    },
  },
};

const options = {
  definition,
  apis: [path.resolve(__dirname, '../routes/**/*.js')],
};

const openapiSpecification = swaggerJsdoc(options);

// Attach computed config for docs consumers
openapiSpecification.info['x-generated-at'] = new Date().toISOString();
openapiSpecification.info['x-environment'] = config.env;

module.exports = openapiSpecification;
