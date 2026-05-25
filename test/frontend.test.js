const request = require('supertest');
const vm = require('vm');

function loadApp() {
  jest.resetModules();
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/testdb';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.KEYCLOAK_ISSUER = 'http://keycloak.local/realms/todos';
  process.env.KEYCLOAK_JWKS_URL = 'http://keycloak.local/jwks';
  process.env.KEYCLOAK_CLIENT_ID = 'todo-frontend';

  jest.doMock('pg', () => ({
    Pool: jest.fn(() => ({ query: jest.fn(), end: jest.fn() })),
  }));

  return require('../server').app;
}

function extractScripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

function b64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJwt(sub = 'user-1') {
  return `${b64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${b64UrlJson({ sub })}.sig`;
}

function createSandbox({ search = '', localTokens = null, fetchImpl } = {}) {
  const status = { textContent: '', className: '' };
  const message = { textContent: '', className: '' };
  const whoami = { textContent: '', className: '' };
  const buttonHandlers = {};
  const loginButton = {
    addEventListener: (event, handler) => {
      buttonHandlers[event] = handler;
    },
  };
  const reloadBtn = { addEventListener: jest.fn() };
  const logoutBtn = { addEventListener: jest.fn() };
  const form = { addEventListener: jest.fn(), reset: jest.fn() };
  const todoList = {
    innerHTML: '',
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
  };
  const elements = {
    status,
    loginBtn: loginButton,
    whoami,
    message,
    reloadBtn,
    logoutBtn,
    todoList,
    todoForm: form,
  };

  const localStorage = {
    store: localTokens ? { todo_tokens: JSON.stringify(localTokens) } : {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
  };

  const sessionStorage = {
    store: {},
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
  };

  const location = {
    search,
    assign: jest.fn(),
    replace: jest.fn(),
  };

  const crypto = {
    getRandomValues: (array) => {
      array.fill(1);
      return array;
    },
    subtle: {
      digest: jest.fn(async () => new Uint8Array(32).fill(7).buffer),
    },
  };

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    crypto,
    fetch: fetchImpl || jest.fn(),
    document: {
      getElementById: (id) => elements[id],
      createElement: () => ({ className: '', innerHTML: '', dataset: {}, appendChild: jest.fn() }),
    },
    localStorage,
    sessionStorage,
    location,
    window: null,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return { sandbox, elements, buttonHandlers, localStorage, sessionStorage, location };
}

async function renderPage(app, path) {
  return request(app).get(path).expect(200);
}

function runScripts(html, sandbox) {
  const context = vm.createContext(sandbox);
  for (const script of extractScripts(html)) {
    vm.runInContext(script, context);
  }
  return context;
}

afterEach(() => {
  jest.dontMock('pg');
  delete process.env.KEYCLOAK_ISSUER;
  delete process.env.KEYCLOAK_JWKS_URL;
  delete process.env.KEYCLOAK_CLIENT_ID;
});

describe('Keycloak frontend flow', () => {
  test('/login builds a PKCE authorization request', async () => {
    const app = loadApp();
    const res = await renderPage(app, '/login');
    expect(res.text).toContain('Sign in with Keycloak');
    expect(res.text).toContain('/protocol/openid-connect/auth');

    const { sandbox, buttonHandlers, sessionStorage, location } = createSandbox();
    runScripts(res.text, sandbox);

    expect(typeof buttonHandlers.click).toBe('function');
    await buttonHandlers.click();

    const redirectUrl = new URL(location.assign.mock.calls[0][0]);
    expect(redirectUrl.pathname).toBe('/realms/todos/protocol/openid-connect/auth');
    expect(redirectUrl.searchParams.get('client_id')).toBe('todo-frontend');
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirectUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(redirectUrl.searchParams.get('state')).toBeTruthy();
    expect(sessionStorage.getItem('todo_pkce_verifier')).toBeTruthy();
    expect(sessionStorage.getItem('todo_pkce_state')).toBeTruthy();
  });

  test('/auth/callback exchanges code and stores tokens', async () => {
    const app = loadApp();
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'access.token.value',
        refresh_token: 'refresh.token.value',
        id_token: 'id.token.value',
        expires_in: 300,
      }),
    }));
    const { sandbox, localStorage, sessionStorage, location } = createSandbox({
      search: '?code=abc123&state=state-1',
      fetchImpl,
    });
    sessionStorage.setItem('todo_pkce_state', 'state-1');
    sessionStorage.setItem('todo_pkce_verifier', 'verifier-1');

    const res = await renderPage(app, '/auth/callback?code=abc123&state=state-1');
    runScripts(res.text, sandbox);

    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://keycloak.local/realms/todos/protocol/openid-connect/token');
    expect(init.method).toBe('POST');
    expect(init.body.toString()).toContain('grant_type=authorization_code');
    expect(init.body.toString()).toContain('client_id=todo-frontend');
    expect(init.body.toString()).toContain('code_verifier=verifier-1');
    expect(JSON.parse(localStorage.getItem('todo_tokens'))).toMatchObject({
      access_token: 'access.token.value',
      refresh_token: 'refresh.token.value',
      id_token: 'id.token.value',
    });
    expect(location.replace).toHaveBeenCalledWith('/app');
  });

  test('/auth/callback fails fast on invalid state', async () => {
    const app = loadApp();
    const fetchImpl = jest.fn();
    const { sandbox, sessionStorage, elements } = createSandbox({
      search: '?code=abc123&state=wrong-state',
      fetchImpl,
    });
    sessionStorage.setItem('todo_pkce_state', 'state-1');
    sessionStorage.setItem('todo_pkce_verifier', 'verifier-1');

    const res = await renderPage(app, '/auth/callback?code=abc123&state=wrong-state');
    runScripts(res.text, sandbox);

    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(elements.status.textContent).toBe('Invalid login state');
  });

  test('/app sends the stored access token as a bearer header', async () => {
    const app = loadApp();
    const fetchImpl = jest.fn(async (url, init = {}) => {
      if (url === '/todos') {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const accessToken = makeJwt('user-1');
    const { sandbox, location } = createSandbox({
      localTokens: { access_token: accessToken, refresh_token: null, id_token: 'id' },
      fetchImpl,
    });

    const res = await renderPage(app, '/app');
    runScripts(res.text, sandbox);

    await new Promise((resolve) => setImmediate(resolve));

    expect(location.replace).not.toHaveBeenCalledWith('/login');
    expect(fetchImpl).toHaveBeenCalledWith('/todos', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${accessToken}` }),
    }));
  });

  test('/app redirects unauthenticated users to login', async () => {
    const app = loadApp();
    const { sandbox, location } = createSandbox();

    const res = await renderPage(app, '/app');
    runScripts(res.text, sandbox);

    expect(location.replace).toHaveBeenCalledWith('/login');
  });
});
