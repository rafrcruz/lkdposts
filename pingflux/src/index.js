const http = require('node:http');

const config = require('./config');
const app = require('./web/server');

const server = http.createServer(app);

const start = () => {
  server.listen(config.server.port, config.server.host, () => {
    console.log(`Pingflux listening on http://${config.server.host}:${config.server.port}`);
  });
};

const shutdown = (signal) => {
  console.log(`Received ${signal}. Closing server...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown.');
    process.exit(1);
  }, 5000).unref();
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

start();
