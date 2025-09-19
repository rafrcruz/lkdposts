const ApiError = require('../utils/api-error');

const notFoundHandler = (req, res, next) => {
  next(
    new ApiError({
      statusCode: 404,
      message: 'Resource not found',
      code: 'NOT_FOUND',
      details: { path: req.originalUrl },
    })
  );
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: {
      code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'UNKNOWN_ERROR'),
      message: statusCode === 500 ? 'Internal server error' : err.message,
      details: err.details ?? undefined,
    },
    meta: {
      requestId: req.id,
    },
  };

  if (statusCode >= 500) {
    console.error('Unhandled error:', err);
  } else {
    console.warn('Handled error:', err.message);
  }

  res.status(statusCode).json(response);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
