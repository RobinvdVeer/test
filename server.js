const { createApp } = require('./src/app');
const { getConfig } = require('./src/config');
const { getPool, closePool } = require('./src/db/pool');
const { startScheduler } = require('./src/email/scheduler');

const { PORT } = getConfig();

let pool;

const app = createApp();

let server;

if (require.main === module) {
  (async () => {
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

    // Start the email reminder scheduler after the HTTP server is ready.
    let scheduler;
    await startScheduler(app, { PORT })
      .then((handle) => {
        scheduler = handle;
      })
      .catch((err) => {
        console.error('[server] Failed to start scheduler:', err.message);
        // Don't exit — the API should still work without reminders.
      });

    process.on('SIGTERM', async () => {
      console.log('SIGTERM signal received: shutting down');
      if (!server) return;

      server.close(async () => {
        console.log('HTTP server closed');

        // Stop the scheduler and close the database pool.
        if (scheduler) {
          await scheduler.stop();
        }

        await closePool()
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
  })();
}

module.exports = { app, pool, startScheduler };
