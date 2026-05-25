const { createApp } = require('./src/app');
const { getConfig } = require('./src/config');

const { PORT } = getConfig();

let pool;

const app = createApp();

let server;

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Import DB pool only when the server is actually starting.
  ({ pool } = require('./src/db/pool'));

  server = app.listen(PORT, () => {
    console.log(`Metrics & Todo server running on http://localhost:${PORT}`);
    console.log(`Access openapi at http://localhost:${PORT}/openapi.json`);
    console.log(
      `Access metrics at http://localhost:${PORT}/metrics (requires X-User-Id header)`
    );
    console.log('Access todos at /todos (requires X-User-Id header)');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (!server) return;

    server.close(() => {
      console.log('HTTP server closed');
      pool
        .end()
        .then(() => {
          console.log('Database pool closed');
          process.exit(0);
        })
        .catch((err) => {
          console.error('Error closing database pool:', err);
          process.exit(1);
        });
    });
  });
}

module.exports = { app, pool };
