const express = require('express');
const bodyParser = require('body-parser');
const openApiDocument = require('../openapi.json');
const { userMiddleware } = require('./middleware/user');
const { registerFrontendRoutes } = require('./routes/frontend');
const { registerMetricsRoutes } = require('./routes/metrics');
const { registerTodosRoutes } = require('./routes/todos');

function createApp() {
  const app = express();
  const startTime = Date.now();

  app.use(bodyParser.json({ limit: '1mb' }));

  // Public endpoints used by gateways, health probes, and the browser app.
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  registerFrontendRoutes(app);

  // Remaining API requires identification.
  app.use(userMiddleware);

  // /metrics
  registerMetricsRoutes(app, startTime);

  // /todos
  app.use('/todos', registerTodosRoutes());

  return app;
}

module.exports = { createApp };
