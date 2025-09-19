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
