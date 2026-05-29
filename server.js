const { createApp } = require('./src/app');
const { getConfig } = require('./src/config');
const { migrateDatabase } = require('./src/db/migrate');
const { getPool, closePool } = require('./src/db/pool');
const { createTodoReminderService } = require('./src/email/reminderService');

const { PORT } = getConfig();

let pool;
let server;
let reminderStop;

const app = createApp();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  pool = getPool();
  await migrateDatabase(pool);

  const config = getConfig();
  const reminderService = createTodoReminderService({ pool, config: config.emailReminders });
  reminderStop = reminderService.start();

  server = app.listen(PORT, () => {
    console.log(`Todo app running on http://localhost:${PORT}`);
    console.log(`Login page at http://localhost:${PORT}/login`);
    console.log(`OpenAPI at http://localhost:${PORT}/openapi.json`);
    console.log(`Todos require a Bearer JWT from Keycloak`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    if (reminderStop) reminderStop();
    if (!server) return;

    server.close(() => {
      console.log('HTTP server closed');
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

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app, pool, main };
