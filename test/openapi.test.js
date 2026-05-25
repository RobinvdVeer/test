const request = require('supertest');
const SwaggerParser = require('@apidevtools/swagger-parser');
const openApiDocument = require('../openapi.json');
const { execFileSync } = require('child_process');

let queryMock;

function loadApp() {
  jest.resetModules();

  // Ensure required env vars for module initialization.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://test:test@localhost:5432/testdb';
  process.env.KEYCLOAK_ISSUER_URL =
    process.env.KEYCLOAK_ISSUER_URL || 'https://keycloak.local/realms/todos';
  process.env.KEYCLOAK_JWKS_URL =
    process.env.KEYCLOAK_JWKS_URL ||
    'https://keycloak.local/realms/todos/protocol/openid-connect/certs';
  process.env.KEYCLOAK_CLIENT_ID =
    process.env.KEYCLOAK_CLIENT_ID || 'todo-app';

  queryMock = jest.fn();
  jest.doMock('pg', () => ({
    Pool: jest.fn(() => ({ query: queryMock, end: jest.fn() })),
  }));
  return require('../server').app;
}

afterEach(() => {
  jest.dontMock('pg');
});

test('openapi.json is a valid OpenAPI 3 document for implemented routes', async () => {
  const documentCopy = JSON.parse(JSON.stringify(openApiDocument));

  await expect(SwaggerParser.validate(documentCopy)).resolves.toBeDefined();

  expect(openApiDocument.openapi).toMatch(/^3\./);
  expect(Object.keys(openApiDocument.paths)).toEqual(expect.arrayContaining([
    '/openapi.json',
    '/api/docs/openapi.json',
    '/health',
    '/metrics',
    '/todos',
    '/todos/{id}'
  ]));
});

test('served /openapi.json matches committed openapi.json', async () => {
  const app = loadApp();

  const res = await request(app).get('/openapi.json').expect(200);

  expect(res.body).toEqual(openApiDocument);
  expect(queryMock).not.toHaveBeenCalled();
});

test('scripts/check-openapi.js contract check passes', () => {
  execFileSync('node', ['scripts/check-openapi.js'], { stdio: 'ignore' });
});
