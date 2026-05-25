const express = require('express');
const bodyParser = require('body-parser');
const openApiDocument = require('../openapi.json');
const { userMiddleware } = require('./middleware/user');
const { registerMetricsRoutes } = require('./routes/metrics');
const { registerTodosRoutes } = require('./routes/todos');

function createApp() {
  const app = express();
  const startTime = Date.now();

  app.use(bodyParser.json());

  // Public endpoints used by gateways, health probes, and API discovery.
  app.get('/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  app.get('/api/docs/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Remaining API requires identification.
  app.use(userMiddleware);

  // /metrics
  registerMetricsRoutes(app, startTime);

  // /todos
  app.use('/todos', registerTodosRoutes());

  return app;
}

module.exports = { createApp };
