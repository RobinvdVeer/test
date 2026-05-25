const assert = require('assert');
const { createApp } = require('../src/app');
const openapi = require('../openapi.json');
const {
  collectExpressRoutes,
  operationsFromOpenApi,
  operationsFromExpress,
} = require('../src/openapi/contractCheckHelpers');

const app = createApp();
const expressRoutes = collectExpressRoutes(app);
const expressOps = operationsFromExpress(expressRoutes);
const openapiOps = operationsFromOpenApi(openapi);

// Compare the subset of operations we expect to be implemented by the HTTP app.
assert.strictEqual(openapiOps.size > 0, true, 'openapi.json contains no operations');

for (const op of openapiOps) {
  assert.ok(
    expressOps.has(op),
    `Missing Express route for OpenAPI operation: ${op}.\nExpress ops: ${[
      ...expressOps,
    ]
      .sort()
      .join(', ')}`
  );
}

for (const op of expressOps) {
  // We don't require Express middleware-generated routes beyond what's in OpenAPI
  assert.ok(
    openapiOps.has(op),
    `OpenAPI missing operation that Express exposes: ${op}.\nOpenAPI ops: ${[
      ...openapiOps,
    ]
      .sort()
      .join(', ')}`
  );
}

console.log('OpenAPI contract check: OK');
