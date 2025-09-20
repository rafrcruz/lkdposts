const config = require('../config');

const productionCookieOptions = {
  secure: true,
  sameSite: 'none',
};

const nonProductionCookieOptions = {
  secure: false,
  sameSite: 'lax',
};

const getSessionCookieBaseOptions = () => ({
  httpOnly: true,
  signed: true,
  path: '/',
  ...(config.isProduction ? productionCookieOptions : nonProductionCookieOptions),
});

const getSessionCookieOptions = (expiresAt) => ({
  ...getSessionCookieBaseOptions(),
  expires: expiresAt,
});

module.exports = {
  getSessionCookieBaseOptions,
  getSessionCookieOptions,
};
