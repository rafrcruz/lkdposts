const app = require('./app');
const { ensureAppBootstrapped } = require('./startup');

module.exports = async (req, res) => {
  try {
    await ensureAppBootstrapped();
    return app(req, res);
  } catch (error) {
    console.error('Failed to bootstrap application', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { message: 'Internal Server Error' } }));
  }
};
