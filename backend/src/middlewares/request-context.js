const { randomUUID } = require('node:crypto');

const attachRequestId = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.length > 0 ? incomingId : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

module.exports = {
  attachRequestId,
};
