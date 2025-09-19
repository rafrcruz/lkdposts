const config = require('../config');

const getSessionCookieBaseOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'none' : 'lax',
  signed: true,
  path: '/',
});

const getSessionCookieOptions = (expiresAt) => ({
  ...getSessionCookieBaseOptions(),
  expires: expiresAt,
});

module.exports = {
  getSessionCookieBaseOptions,
  getSessionCookieOptions,
};
