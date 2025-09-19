const Sentry = require('@sentry/node');
const config = require('../config');
const packageJson = require('../../package.json');

let initialized = false;

const initSentry = () => {
  if (initialized) {
    return true;
  }

  if (!config.sentry?.dsn) {
    return false;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.env,
    release: `backend@${packageJson.version}`,
    tracesSampleRate: config.sentry.tracesSampleRate,
    profilesSampleRate: config.sentry.profilesSampleRate,
    attachStacktrace: true,
  });

  initialized = true;
  return true;
};

const setupSentryRequestHandler = (app) => {
  const enabled = initSentry();

  if (enabled) {
    app.use(Sentry.Handlers.requestHandler({ user: true }));
  }

  return enabled;
};

const setupSentryErrorHandler = (app) => {
  if (!initialized) {
    return false;
  }

  app.use(Sentry.Handlers.errorHandler());
  return true;
};

const captureException = (error) => {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error);
};

const flushSentry = async (timeoutMs = 2000) => {
  if (!initialized) {
    return;
  }

  try {
    await Sentry.flush(timeoutMs);
  } catch (err) {
    console.error('Failed to flush Sentry events:', err);
  }
};

module.exports = {
  Sentry,
  setupSentryRequestHandler,
  setupSentryErrorHandler,
  captureException,
  flushSentry,
};
