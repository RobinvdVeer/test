const { createApp } = require('./src/app');
const { getConfig } = require('./src/config');
const { getPool, closePool, initializeDatabase } = require('./src/db/pool');

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
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    console.log('Database initialization complete');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`Todo app running on http://localhost:${PORT}`);
    console.log(`Login page at http://localhost:${PORT}/login`);
    console.log(`OpenAPI at http://localhost:${PORT}/openapi.json`);
    console.log(`Todos require a Bearer JWT from Keycloak`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
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

module.exports = { app, pool };
