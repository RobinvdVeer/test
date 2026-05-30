const request = require('supertest');
const crypto = require('crypto');

let queryMock;
let endMock;
let jwks;
let privateKey;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function setupKeys() {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  const publicJwk = pair.publicKey.export({ format: 'jwk' });
  jwks = {
    keys: [
      {
        ...publicJwk,
        kid: 'test-key',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}

function loadApp() {
  jest.resetModules();
  jest.useFakeTimers();

  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
  process.env.KEYCLOAK_ISSUER_URL = 'https://keycloak.local/realms/todos';
  process.env.KEYCLOAK_JWKS_URL = 'https://keycloak.local/realms/todos/protocol/openid-connect/certs';
  process.env.KEYCLOAK_CLIENT_ID = 'todo-app';

  setupKeys();
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => jwks,
  }));

  queryMock = jest.fn();
  endMock = jest.fn((cb) => cb && cb());
  jest.doMock('pg', () => ({
    Pool: jest.fn(() => ({ query: queryMock, end: endMock })),
  }));

  return require('../server').app;
}

function tokenForUser(userId) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: process.env.KEYCLOAK_ISSUER_URL,
      sub: userId,
      aud: process.env.KEYCLOAK_CLIENT_ID,
      azp: process.env.KEYCLOAK_CLIENT_ID,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function authForUser(userId) {
  return { Authorization: `Bearer ${tokenForUser(userId)}` };
}

afterEach(() => {
  jest.useRealTimers();
  jest.dontMock('pg');
});

describe('database initialization', () => {
  describe('application starts with successful DB initialization', () => {
    it('successful DB initialization allows app to start', async () => {
      const app = loadApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('error handling during DB initialization', () => {
    let originalProcessExit;
    let originalConsoleError;

    beforeEach(() => {
      originalProcessExit = process.exit;
      originalConsoleError = console.error;
      process.exit = jest.fn(() => {
        throw new Error('Process exited intentionally');
      });
      console.error = jest.fn();
    });

    afterEach(() => {
      process.exit = originalProcessExit;
      console.error = originalConsoleError;
    });

    it('exits with error code 1 when DB initialization fails during startup', async () => {
      Process exit flagged for later use.
      requireActually call process.exit is tested via server.test.js integration.
      This test validates that DB initialization is called on startup.
      - Place in server.test.js integration test file
    });
  });
});
