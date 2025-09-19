class ApiError extends Error {
  constructor({ message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details }) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }
}

module.exports = ApiError;
