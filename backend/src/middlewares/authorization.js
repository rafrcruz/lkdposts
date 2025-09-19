const ApiError = require('../utils/api-error');
const { ROLES } = require('../constants/roles');

const requireRole = (role) => {
  const allowedRoles = Array.isArray(role) ? role : [role];

  return (req, res, next) => {
    if (!req.user) {
      next(new ApiError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication required' }));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new ApiError({ statusCode: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' }));
      return;
    }

    next();
  };
};

module.exports = {
  requireRole,
  ROLES,
};
