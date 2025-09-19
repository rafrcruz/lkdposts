const { initializeAuth } = require('./services/auth.service');

let bootstrapPromise;

const ensureAppBootstrapped = () => {
  if (!bootstrapPromise) {
    bootstrapPromise = initializeAuth().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }

  return bootstrapPromise;
};

module.exports = {
  ensureAppBootstrapped,
};
