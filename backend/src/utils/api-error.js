class ApiError extends Error {
  constructor({ message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    if (cause) {
      this.cause = cause;
    }
    Error.captureStackTrace?.(this, ApiError);
  }
}

module.exports = ApiError;
