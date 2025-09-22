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
            type: 'string',
            example: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          },
          createdAt: {
            type: ['string', 'null'],
            format: 'date-time',
            example: '2025-01-20T12:35:30.000Z',
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
