const { createApp } = require('./src/app');
const { getConfig } = require('./src/config');
const { getPool, closePool } = require('./src/db/pool');
const { startReminderScheduler, stopReminderScheduler } = require('./src/services/reminderService');

const { PORT } = getConfig();

let pool;

const app = createApp();

let server;

if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  pool = getPool();

  server = app.listen(PORT, () => {
    console.log(`Todo app running on http://localhost:${PORT}`);
    console.log(`Login page at http://localhost:${PORT}/login`);
    console.log(`OpenAPI at http://localhost:${PORT}/openapi.json`);
    console.log(`Todos require a Bearer JWT from Keycloak`);
  });

  // Start the reminder scheduler (non-blocking) after the server is listening.
  startReminderScheduler();

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (!server) return;

    server.close(() => {
      console.log('HTTP server closed');
      stopReminderScheduler();
      closePool()
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
