const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const morgan = require('morgan');
const xssClean = require('xss-clean');

const contentSecurityPolicy = helmet.contentSecurityPolicy;

const config = require('./config');
const routes = require('./routes');
const ApiError = require('./utils/api-error');
const { metricsMiddleware } = require('./utils/metrics');
const { responseEnvelope } = require('./middlewares/response-envelope');
const { attachRequestId } = require('./middlewares/request-context');
const { globalRateLimiter } = require('./middlewares/rate-limit');
const { notFoundHandler, errorHandler } = require('./middlewares/error-handler');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('etag', 'strong');

const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const corsError = new ApiError({
      statusCode: 403,
      message: 'Origin not allowed by CORS policy',
      code: 'CORS_NOT_ALLOWED',
    });
    return callback(corsError);
  },
  optionsSuccessStatus: 204,
};

const jsonParser = express.json({
  limit: config.security.payloadLimit,
  strict: true,
});

const urlEncodedParser = express.urlencoded({
  extended: false,
  limit: config.security.payloadLimit,
});

app.use(attachRequestId);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      ...contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'"],
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(hpp());
app.use(compression());
app.use(metricsMiddleware);
app.use(globalRateLimiter);
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use((req, res, next) => jsonParser(req, res, (error) => {
  if (error) {
    return next(
      new ApiError({
        statusCode: 400,
        message: 'Invalid JSON payload',
        code: 'INVALID_JSON',
        details: { error: error.message },
      })
    );
  }
  return next();
}));
app.use((req, res, next) => urlEncodedParser(req, res, (error) => {
  if (error) {
    return next(
      new ApiError({
        statusCode: 400,
        message: 'Invalid URL encoded payload',
        code: 'INVALID_FORM_BODY',
        details: { error: error.message },
      })
    );
  }
  return next();
}));
app.use(xssClean());
app.use(responseEnvelope);

app.get('/', (req, res) => {
  res.withCache(30);
  return res.success({ message: 'lkdposts API', version: 'v1' });
});

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
