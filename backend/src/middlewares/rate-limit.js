const rateLimit = require('express-rate-limit');
const config = require('../config');
const ApiError = require('../utils/api-error');

const globalRateLimiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(
      new ApiError({
        statusCode: 429,
        message: 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    );
  },
});

module.exports = {
  globalRateLimiter,
};
