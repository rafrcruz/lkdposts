const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

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
          data: { type: 'object' },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string', format: 'uuid' },
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
              details: { type: 'object' },
            },
          },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string', format: 'uuid' },
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
          lastFetchedAt: { type: ['string', 'null'], format: 'date-time', example: null },
          createdAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2025-01-20T12:34:56.000Z' },
        },
      },
      FeedBulkResult: {
        type: 'object',
        properties: {
          created: {
            type: 'array',
            items: { $ref: '#/components/schemas/Feed' },
          },
          duplicates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                reason: { type: 'string', example: 'ALREADY_EXISTS' },
                feedId: { type: ['integer', 'null'], example: 1 },
              },
            },
          },
          invalid: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                reason: { type: 'string', example: 'INVALID_URL' },
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
