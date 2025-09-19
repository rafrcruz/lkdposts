const http = require('http');

const app = require('./app');
const config = require('./config');
const { disconnectDatabase } = require('./lib/prisma');

const server = http.createServer(app);

server.listen(config.server.port, config.server.host, () => {
  console.log('Backend listening on http://' + config.server.host + ':' + config.server.port);
});

let isShuttingDown = false;

const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log('Received ' + signal + '. Shutting down gracefully...');

  server.close(() => {
    console.log('HTTP server closed.');
    disconnectDatabase().finally(() => {
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    disconnectDatabase().finally(() => {
      process.exit(1);
    });
  }, 10_000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});
