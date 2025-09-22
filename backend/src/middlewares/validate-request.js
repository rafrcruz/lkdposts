const ApiError = require('../utils/api-error');

const formatZodIssues = (issues) =>
  issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

const validateRequest = ({ body, query, params } = {}) => {
  return (req, res, next) => {
    try {
      const validated = {};

      if (body) {
        validated.body = body.parse(req.body ?? {});
      }

      if (query) {
        validated.query = query.parse(req.query ?? {});
      }

      if (params) {
        validated.params = params.parse(req.params ?? {});
      }

      req.validated = Object.assign({}, req.validated, validated);
      next();
    } catch (error) {
      if (error?.errors && Array.isArray(error.errors)) {
        return next(
          new ApiError({
            statusCode: 400,
            code: 'INVALID_INPUT',
            message: 'Invalid input data',
            details: { errors: formatZodIssues(error.errors) },
          })
        );
      }

      return next(error);
    }
  };
};

module.exports = {
  validateRequest,
};
