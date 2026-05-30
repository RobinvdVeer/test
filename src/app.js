const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const openApiDocument = require('../openapi.json');
const { getConfig } = require('./config');
const { authMiddleware } = require('./middleware/user');
const { ensureUserMiddleware } = require('./middleware/ensure-user');
const { registerMetricsRoutes } = require('./routes/metrics');
const { registerTodosRoutes } = require('./routes/todos');

function createApp() {
  const app = express();
  const startTime = Date.now();
  const config = getConfig();
  const publicDir = path.join(__dirname, '..', 'public');

  app.use(bodyParser.json({ limit: '1mb' }));
  app.use('/assets', express.static(path.join(publicDir, 'assets')));

  app.get('/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  app.get('/api/docs/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  app.get('/auth-config.json', (req, res) => {
    res.json({
      issuerUrl: config.auth.issuerUrl,
      clientId: config.auth.clientId,
      authorizeUrl: config.auth.authorizeUrl,
      tokenUrl: config.auth.tokenUrl,
      logoutUrl: config.auth.logoutUrl,
      redirectUri: config.auth.redirectUri,
      postLogoutRedirectUri: config.auth.postLogoutRedirectUri,
      scope: config.auth.scope,
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/login', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
  });

  app.get('/auth/callback', (req, res) => {
    res.sendFile(path.join(publicDir, 'auth', 'callback.html'));
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  registerMetricsRoutes(app, startTime);

  app.use('/todos', authMiddleware, ensureUserMiddleware, registerTodosRoutes());

  // Start notification scheduler if enabled
  if (config.notifications?.enabled) {
    const { startScheduler } = require('./scheduler/notifications');
    const stopScheduler = startScheduler();

    // Store stop function on app for graceful shutdown
    app.locals.stopScheduler = stopScheduler;
  }

  return app;
}

module.exports = { createApp };
