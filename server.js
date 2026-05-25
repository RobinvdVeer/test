const { createApp } = require('./src/app');
const { pool } = require('./src/db/pool');
const { getConfig } = require('./src/config');

const { PORT } = getConfig();

const app = createApp();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
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

const server = app.listen(PORT, () => {
  console.log(`Metrics & Todo server running on http://localhost:${PORT}`);
  console.log(`Access metrics at http://localhost:${PORT}/metrics`);
  console.log(`Access todos at http://localhost:${PORT}/todos (requires X-User-Id header)`);
});
