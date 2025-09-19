const responseEnvelope = (req, res, next) => {
  res.success = (data = null, options = {}) => {
    const { statusCode = 200, meta } = options;

    const payload = {
      success: true,
      data,
      meta: {
        requestId: req.id,
        ...meta,
      },
    };

    return res.status(statusCode).json(payload);
  };

  res.withCache = (seconds, scope = 'public') => {
    if (typeof seconds === 'number' && seconds >= 0) {
      res.setHeader('Cache-Control', `${scope}, max-age=${seconds}`);
    }
    return res;
  };

  next();
};

module.exports = {
  responseEnvelope,
};
