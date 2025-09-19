const http = require('http');

const app = require('./app');
const config = require('./config');
const { disconnectDatabase } = require('./lib/prisma');
const { initializeAuth } = require('./services/auth.service');
const { flushSentry, captureException } = require('./lib/sentry');

const server = http.createServer(app);

const startServer = async () => {
  try {
    await initializeAuth();
    server.listen(config.server.port, config.server.host, () => {
      console.log('Backend listening on http://' + config.server.host + ':' + config.server.port);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('Received ' + signal + '. Shutting down gracefully...');

  server.close(() => {
    console.log('HTTP server closed.');
    Promise.allSettled([
      disconnectDatabase(),
      flushSentry(),
    ]).finally(() => {
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    Promise.allSettled([
      disconnectDatabase(),
      flushSentry(),
    ]).finally(() => {
      process.exit(1);
    });
  }, 10_000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  captureException(error);
  gracefulShutdown('uncaughtException');
});
