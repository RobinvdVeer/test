const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const originalGlobals = {
  crypto: global.crypto,
  fetch: global.fetch,
  btoa: global.btoa,
  localStorage: global.localStorage,
  sessionStorage: global.sessionStorage,
  window: global.window,
  TextEncoder: global.TextEncoder,
};

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function setBrowserGlobals({ randomValue = 1 } = {}) {
  const fillRandom = jest.fn((target) => {
    for (let i = 0; i < target.length; i += 1) {
      target[i] = randomValue + i;
    }
    return target;
  });

  global.crypto = {
    subtle: crypto.webcrypto.subtle,
    getRandomValues: fillRandom,
  };
  global.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  global.localStorage = createStorage();
  global.sessionStorage = createStorage();
  global.window = {
    location: {
      assign: jest.fn(),
      replace: jest.fn(),
      search: '',
    },
  };
  global.TextEncoder = TextEncoder;
}

function setFetchMock(impl) {
  const mock = jest.fn(impl);
  Object.defineProperty(global, '__fetch', {
    configurable: true,
    writable: true,
    value: mock,
  });
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: mock,
  });

  return mock;
}

async function loadAuthClient() {
  const source = fs.readFileSync(path.join(__dirname, '../public/assets/auth.js'), 'utf8');
  const transformed = `${source
    .replace(/export async function /g, 'async function ')
    .replace(/export function /g, 'function ')}\nmodule.exports = {\n  loadAuthConfig,\n  getStoredAuth,\n  setStoredAuth,\n  clearStoredAuth,\n  getReturnTo,\n  setReturnTo,\n  clearReturnTo,\n  getPkceVerifier,\n  setPkceVerifier,\n  clearPkceVerifier,\n  getPkceState,\n  setPkceState,\n  clearPkceState,\n  isTokenValid,\n  generatePkcePair,\n  startLogin,\n  completeLoginFromCallback,\n  logout,\n};\nreturn module.exports;\n`;

  const factory = new Function(
    'fetch',
    'window',
    'localStorage',
    'sessionStorage',
    'btoa',
    'TextEncoder',
    'crypto',
    'URL',
    'URLSearchParams',
    'module',
    'exports',
    transformed
  );

  const mod = { exports: {} };
  return factory(
    global.fetch,
    global.window,
    global.localStorage,
    global.sessionStorage,
    global.btoa,
    global.TextEncoder,
    global.crypto,
    URL,
    URLSearchParams,
    mod,
    mod.exports
  );
}

function readStoredAuth() {
  return JSON.parse(global.sessionStorage.getItem('todo-auth'));
}

afterEach(() => {
  global.crypto = originalGlobals.crypto;
  global.fetch = originalGlobals.fetch;
  global.__fetch = undefined;
  global.btoa = originalGlobals.btoa;
  global.localStorage = originalGlobals.localStorage;
  global.sessionStorage = originalGlobals.sessionStorage;
  global.window = originalGlobals.window;
  global.TextEncoder = originalGlobals.TextEncoder;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('browser auth helpers', () => {
  test('startLogin generates PKCE params and redirects to Keycloak', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    setBrowserGlobals();

    setFetchMock(async () => ({
      ok: true,
      json: async () => ({
        authorizeUrl: 'https://keycloak.example/realms/todos/protocol/openid-connect/auth',
        clientId: 'todo-app',
        redirectUri: 'http://localhost:3000/auth/callback',
        scope: 'openid profile email',
      }),
    }));

    const auth = await loadAuthClient();
    await auth.startLogin('/todos?category=work');

    expect(global.fetch).toHaveBeenCalledWith('/auth-config.json', {
      headers: { accept: 'application/json' },
    });

    const redirected = new URL(global.window.location.assign.mock.calls[0][0]);
    expect(redirected.origin + redirected.pathname).toBe(
      'https://keycloak.example/realms/todos/protocol/openid-connect/auth'
    );
    expect(redirected.searchParams.get('response_type')).toBe('code');
    expect(redirected.searchParams.get('client_id')).toBe('todo-app');
    expect(redirected.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/callback'
    );
    expect(redirected.searchParams.get('scope')).toBe('openid profile email');
    expect(redirected.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirected.searchParams.get('state')).toBe(global.sessionStorage.getItem('todo-pkce-state'));
    expect(global.sessionStorage.getItem('todo-return-to')).toBe('/todos?category=work');

    const verifierBytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const stateBytes = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
    const expectedVerifier = base64UrlEncode(verifierBytes);
    const expectedState = base64UrlEncode(stateBytes);
    const digest = await crypto.webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(expectedVerifier)
    );
    const expectedChallenge = base64UrlEncode(new Uint8Array(digest));

    expect(global.sessionStorage.getItem('todo-pkce-verifier')).toBe(expectedVerifier);
    expect(global.sessionStorage.getItem('todo-pkce-state')).toBe(expectedState);
    expect(redirected.searchParams.get('code_challenge')).toBe(expectedChallenge);
  });

  test('completeLoginFromCallback exchanges the code and stores the tokens', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    setBrowserGlobals();

    global.window.location.search = '?code=auth-code&state=abc123';
    global.sessionStorage.setItem('todo-pkce-verifier', 'verifier');
    global.sessionStorage.setItem('todo-pkce-state', 'abc123');
    global.sessionStorage.setItem('todo-return-to', '/todos');

    const tokenResponse = {
      access_token: 'access-token',
      id_token: 'id-token',
      token_type: 'Bearer',
      expires_in: 3600,
    };
    setFetchMock()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tokenUrl: 'https://keycloak.example/realms/todos/protocol/openid-connect/token',
          clientId: 'todo-app',
          redirectUri: 'http://localhost:3000/auth/callback',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => tokenResponse,
      });

    const auth = await loadAuthClient();
    const returnTo = await auth.completeLoginFromCallback();

    expect(returnTo).toBe('/todos');
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://keycloak.example/realms/todos/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.any(URLSearchParams),
    });

    const body = global.fetch.mock.calls[1][1].body;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('todo-app');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
    expect(body.get('code_verifier')).toBe('verifier');

    const stored = readStoredAuth();
    expect(stored.access_token).toBe('access-token');
    expect(stored.id_token).toBe('id-token');
    expect(stored.expires_at).toBe(Date.parse('2024-01-01T01:00:00.000Z'));
    expect(global.sessionStorage.getItem('todo-pkce-verifier')).toBeNull();
    expect(global.sessionStorage.getItem('todo-pkce-state')).toBeNull();
    expect(global.sessionStorage.getItem('todo-return-to')).toBeNull();
  });

  test('completeLoginFromCallback rejects invalid state before exchanging tokens', async () => {
    setBrowserGlobals();
    global.window.location.search = '?code=auth-code&state=wrong-state';
    global.sessionStorage.setItem('todo-pkce-verifier', 'verifier');
    global.sessionStorage.setItem('todo-pkce-state', 'expected-state');

    setFetchMock(async () => ({ ok: true, json: async () => ({}) }));

    const auth = await loadAuthClient();

    await expect(auth.completeLoginFromCallback()).rejects.toThrow('Invalid state');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.sessionStorage.getItem('todo-auth')).toBeNull();
  });

  test('completeLoginFromCallback rejects non-2xx token exchange responses', async () => {
    setBrowserGlobals();
    global.window.location.search = '?code=auth-code&state=abc123';
    global.sessionStorage.setItem('todo-pkce-verifier', 'verifier');
    global.sessionStorage.setItem('todo-pkce-state', 'abc123');

    setFetchMock()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tokenUrl: 'https://keycloak.example/realms/todos/protocol/openid-connect/token',
          clientId: 'todo-app',
          redirectUri: 'http://localhost:3000/auth/callback',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({}),
      });

    const auth = await loadAuthClient();

    await expect(auth.completeLoginFromCallback()).rejects.toThrow('Token exchange failed (502)');
    expect(global.sessionStorage.getItem('todo-auth')).toBeNull();
  });
});
