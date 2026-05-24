const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const pool = require('./db/pool');
const { discoverOidcMetadata } = require('./auth/oidcDiscovery');
const { createAuthenticateJwt } = require('./auth/middleware');
const createAuthRouter = require('./routes/auth');
const { createMetricsRouter } = require('./routes/metrics');
const createTodosRouter = require('./routes/todos');

function configureCors(app) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (config.corsOrigin === '*') {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (origin) {
      if (!config.corsOrigins.includes(origin)) {
        return res.sendStatus(403);
      }
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }

    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

async function createApp() {
  const app = express();
  const startTime = Date.now();

  const verificationMetadata = await discoverOidcMetadata(config.auth.issuer, {
    jwks_uri: config.auth.jwksUri,
  });
  const publicMetadata = await discoverOidcMetadata(config.auth.publicIssuer);
  const authenticateJwt = createAuthenticateJwt({
    authConfig: config.auth,
    jwksUri: verificationMetadata.jwks_uri,
  });

  app.use(bodyParser.json({ limit: '16kb' }));
  configureCors(app);

  app.use('/auth', createAuthRouter({ authConfig: config.auth, publicMetadata }));
  app.use(createMetricsRouter({
    startTime,
    metricsMiddleware: config.protectMetrics ? [authenticateJwt] : [],
  }));
  app.use('/todos', createTodosRouter({ pool, authenticateJwt }));

  return app;
}

let server;

async function start() {
  const app = await createApp();
  server = app.listen(config.port, () => {
    console.log(`Metrics & Todo server running on http://localhost:${config.port}`);
    console.log(`Access metrics at http://localhost:${config.port}/metrics`);
    console.log(`Access todos at http://localhost:${config.port}/todos (requires JWT bearer token)`);
    console.log(`OIDC config at http://localhost:${config.port}/auth/config`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
      });
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { createApp, start, pool };
