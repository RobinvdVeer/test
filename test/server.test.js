const request = require('supertest');
const crypto = require('crypto');

// Shared OpenAPI/route normalization helpers (used by scripts/check-openapi.js)
require('../src/openapi/contractCheckHelpers');

const openApiDocument = require('../openapi.json');
const originalFetch = global.fetch;

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

function loadApp(now = '2024-01-01T00:00:00.000Z') {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(now));

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

function upsertSql() {
  return 'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING';
}

afterEach(() => {
  jest.useRealTimers();
  jest.dontMock('pg');
  global.fetch = originalFetch;
});

describe('public discovery and health endpoints', () => {
  test('serves /openapi.json without Bearer token', async () => {
    const app = loadApp();

    const res = await request(app).get('/openapi.json').expect(200);

    expect(res.type).toMatch(/json/);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths['/openapi.json']).toBeDefined();
    expect(res.body.paths['/todos']).toBeDefined();
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves /api/docs/openapi.json without Bearer token', async () => {
    const app = loadApp();

    const res = await request(app).get('/api/docs/openapi.json').expect(200);

    expect(res.type).toMatch(/json/);
    expect(res.body).toEqual(openApiDocument);
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves /health without Bearer token', async () => {
    const app = loadApp();

    await request(app).get('/health').expect(200, { status: 'ok' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves /auth-config.json with Keycloak settings', async () => {
    const app = loadApp();

    const res = await request(app).get('/auth-config.json').expect(200);

    expect(res.body).toEqual({
      issuerUrl: 'https://keycloak.local/realms/todos',
      clientId: 'todo-app',
      authorizeUrl:
        'https://keycloak.local/realms/todos/protocol/openid-connect/auth',
      tokenUrl:
        'https://keycloak.local/realms/todos/protocol/openid-connect/token',
      logoutUrl:
        'https://keycloak.local/realms/todos/protocol/openid-connect/logout',
      redirectUri: 'http://localhost:3000/auth/callback',
      postLogoutRedirectUri: 'http://localhost:3000/login',
      scope: 'openid profile email',
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves the login page', async () => {
    const app = loadApp();

    const res = await request(app).get('/login').expect(200);

    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('<button id="login">Login</button>');
    expect(res.text).toContain('/assets/login.js');
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves the auth callback page', async () => {
    const app = loadApp();

    const res = await request(app).get('/auth/callback').expect(200);

    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Signing in…');
    expect(res.text).toContain('/assets/callback.js');
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves /metrics without auth', async () => {
    const app = loadApp();

    await request(app).get('/metrics').expect(200);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('protected middleware', () => {
  test('rejects protected routes without Bearer token before querying database', async () => {
    const app = loadApp();

    await request(app)
      .get('/todos')
      .expect(401, { error: 'Authorization bearer token is required' });

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('rejects GET /todos/:id without Bearer token before querying database', async () => {
    const app = loadApp();

    await request(app)
      .get('/todos/7')
      .expect(401, { error: 'Authorization bearer token is required' });

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('rejects PUT /todos/:id without Bearer token before querying database', async () => {
    const app = loadApp();

    await request(app)
      .put('/todos/7')
      .send({ title: 'x' })
      .expect(401, { error: 'Authorization bearer token is required' });

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('rejects DELETE /todos/:id without Bearer token before querying database', async () => {
    const app = loadApp();

    await request(app)
      .delete('/todos/7')
      .expect(401, { error: 'Authorization bearer token is required' });

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('rejects invalid bearer tokens before querying database', async () => {
    const app = loadApp();

    await request(app)
      .get('/todos')
      .set({ Authorization: 'Bearer abc.def.ghi' })
      .expect(401, { error: 'Invalid bearer token' });

    expect(queryMock).not.toHaveBeenCalled();
  });

  test('upserts the user before running protected route query', async () => {
    const app = loadApp();
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 1, title: 'todo' }] });

    await request(app).get('/todos').set(authForUser('user-1')).expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(1, upsertSql(), ['user-1']);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC LIMIT $2 OFFSET $3',
      ['user-1', 50, 0]
    );
  });

  test('returns 500 and does not continue when user upsert fails', async () => {
    const app = loadApp();
    queryMock.mockRejectedValueOnce(new Error('db down'));

    await request(app)
      .get('/todos')
      .set(authForUser('user-1'))
      .expect(500, { error: 'Internal server error' });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /todos', () => {
  test('lists todos with default sort and pagination', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    const res = await request(app).get('/todos').set(authForUser('u1')).expect(200);

    expect(res.body).toEqual(rows);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC LIMIT $2 OFFSET $3',
      ['u1', 50, 0]
    );
  });

  test('applies category and status filters with parameterized SQL', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/todos?category=work&status=done')
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 AND category = $2 AND status = $3 ORDER BY last_viewed DESC LIMIT $4 OFFSET $5',
      ['u1', 'work', 'done', 50, 0]
    );
  });

  test('supports limit and offset with stable placeholder ordering', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    const res = await request(app)
      .get('/todos?limit=10&offset=20')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body).toEqual(rows);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC LIMIT $2 OFFSET $3',
      ['u1', 10, 20]
    );
  });

  test('caps limit at 100 and applies OFFSET=0 when offset is omitted', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    const res = await request(app)
      .get('/todos?limit=500')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body).toEqual(rows);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC LIMIT $2 OFFSET $3',
      ['u1', 100, 0]
    );
  });

  test('ignores limit/offset when limit is negative', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    await request(app)
      .get('/todos?limit=-1&offset=20')
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC',
      ['u1']
    );
  });

  test('ignores offset when offset is provided without a valid limit', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    await request(app)
      .get('/todos?offset=20')
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC',
      ['u1']
    );
  });

  test('applies LIMIT 0 when limit=0', async () => {
    const app = loadApp();
    const rows = [];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    const res = await request(app)
      .get('/todos?limit=0')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body).toEqual(rows);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY last_viewed DESC LIMIT $2 OFFSET $3',
      ['u1', 0, 0]
    );
  });

  test('keeps SQL placeholder ordering correct for filters + pagination + sort', async () => {
    const app = loadApp();
    const rows = [{ id: 1, title: 'a' }];
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });

    await request(app)
      .get('/todos?category=work&status=done&limit=5&offset=2&sort_by=created_asc')
      .set(authForUser('u1'))
      .expect(200);

    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('category = $2');
    expect(sql).toContain('status = $3');
    expect(sql).toContain('ORDER BY created_at ASC');
    expect(sql).toContain('LIMIT $4');
    expect(sql).toContain('OFFSET $5');
    expect(params).toEqual(['u1', 'work', 'done', 5, 2]);
  });

  test.each([
    ['created_asc', 'created_at ASC'],
    ['created_desc', 'created_at DESC'],
    ['updated_asc', 'updated_at ASC'],
    ['updated_desc', 'updated_at DESC'],
    ['last_viewed_asc', 'last_viewed ASC'],
    ['last_viewed_desc', 'last_viewed DESC'],
    ['unknown', 'last_viewed DESC'],
  ])('uses %s sort option', async (sortBy, orderBy) => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get(`/todos?sort_by=${sortBy}`)
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      `SELECT * FROM todos WHERE user_id = $1 ORDER BY ${orderBy} LIMIT $2 OFFSET $3`,
      ['u1', 50, 0]
    );
  });

  test('trims and escapes q filter before parameterizing SQL', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/todos?q=%20%20100%25_%5Ctest%20%20&category=work&status=pending')
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      "SELECT * FROM todos WHERE user_id = $1 AND category = $2 AND status = $3 AND (title ILIKE $4 ESCAPE '\\' OR COALESCE(description, '') ILIKE $4 ESCAPE '\\' OR COALESCE(category, '') ILIKE $4 ESCAPE '\\') ORDER BY last_viewed DESC LIMIT $5 OFFSET $6",
      ['u1', 'work', 'pending', '%100\\%\\_\\\\test%', 50, 0]
    );
  });

  test('returns 500 when the list query fails', async () => {
    const app = loadApp();
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .get('/todos')
      .set(authForUser('u1'))
      .expect(500, { error: 'Internal server error' });
  });
});

describe('GET /todos/summary', () => {
  test('returns aggregate counts for the current user', async () => {
    const app = loadApp();
    const row = {
      total: '3',
      pending: '1',
      in_progress: '1',
      completed: '1',
      low: '0',
      medium: '2',
      high: '1',
      latest_created_at: '2024-01-01T00:00:00.000Z',
      latest_updated_at: '2024-01-02T00:00:00.000Z',
    };

    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app).get('/todos/summary?q=build').set(authForUser('u1')).expect(200);

    expect(res.body).toEqual({
      total: 3,
      status_counts: {
        pending: 1,
        in_progress: 1,
        completed: 1,
      },
      priority_counts: {
        low: 0,
        medium: 2,
        high: 1,
      },
      latest_created_at: '2024-01-01T00:00:00.000Z',
      latest_updated_at: '2024-01-02T00:00:00.000Z',
    });

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      `SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
  COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
  COUNT(*) FILTER (WHERE priority = 'low')::int AS low,
  COUNT(*) FILTER (WHERE priority = 'medium')::int AS medium,
  COUNT(*) FILTER (WHERE priority = 'high')::int AS high,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM todos WHERE user_id = $1 AND (title ILIKE $2 ESCAPE '\\' OR COALESCE(description, '') ILIKE $2 ESCAPE '\\' OR COALESCE(category, '') ILIKE $2 ESCAPE '\\')`,
      ['u1', '%build%']
    );
  });

  test('forwards category, status, and escaped q filters to the summary query', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/todos/summary?category=work&status=pending&q=%20%20100%25_%5Ctest%20%20')
      .set(authForUser('u1'))
      .expect(200);

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      `SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
  COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
  COUNT(*) FILTER (WHERE priority = 'low')::int AS low,
  COUNT(*) FILTER (WHERE priority = 'medium')::int AS medium,
  COUNT(*) FILTER (WHERE priority = 'high')::int AS high,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM todos WHERE user_id = $1 AND category = $2 AND status = $3 AND (title ILIKE $4 ESCAPE '\\' OR COALESCE(description, '') ILIKE $4 ESCAPE '\\' OR COALESCE(category, '') ILIKE $4 ESCAPE '\\')`,
      ['u1', 'work', 'pending', '%100\\%\\_\\\\test%']
    );
  });

  test('returns 500 when the summary query fails', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('boom'));

    await request(app)
      .get('/todos/summary')
      .set(authForUser('u1'))
      .expect(500, { error: 'Internal server error' });
  });
});


describe('POST /todos', () => {
  test.each([{}, { title: '' }])('rejects missing or empty title: %p', async (body) => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send(body)
      .expect(400, { error: 'Title is required' });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  test('creates a todo using defaults for omitted optional fields', async () => {
    const app = loadApp();
    const row = { id: 1, title: 'new', status: 'pending', priority: 'medium' };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send({ title: 'new' })
      .expect(201);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      ['u1', 'new', null, null, 'pending', 'medium']
    );
  });

  test('uses default status when status is an empty string', async () => {
    const app = loadApp();
    const row = { id: 1, title: 'new', status: 'pending', priority: 'medium' };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send({ title: 'new', status: '' })
      .expect(201);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      ['u1', 'new', null, null, 'pending', 'medium']
    );
  });

  test('uses default priority when priority is null', async () => {
    const app = loadApp();
    const row = { id: 1, title: 'new', status: 'pending', priority: 'medium' };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send({ title: 'new', priority: null })
      .expect(201);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      ['u1', 'new', null, null, 'pending', 'medium']
    );
  });

  test('preserves explicit nulls for description/category while applying defaults for falsy status/priority', async () => {
    const app = loadApp();
    const row = { id: 1, title: 'new', status: 'pending', priority: 'medium', description: null, category: null };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send({ title: 'new', description: null, category: null, status: '', priority: '' })
      .expect(201);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      ['u1', 'new', null, null, 'pending', 'medium']
    );
  });

  test('returns 500 when insert fails', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .post('/todos')
      .set(authForUser('u1'))
      .send({ title: 'new' })
      .expect(500, { error: 'Internal server error' });
  });
});

describe('GET /todos/:id', () => {
  test('updates last_viewed and returns the todo scoped by id and user', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'view' };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .get('/todos/7')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      `WITH updated AS (
  UPDATE todos
  SET last_viewed = NOW()
  WHERE id = $1 AND user_id = $2
    AND (last_viewed IS NULL OR last_viewed < NOW() - interval '60 seconds')
  RETURNING *
)
SELECT * FROM updated
UNION ALL
SELECT * FROM todos
WHERE id = $1 AND user_id = $2
  AND NOT EXISTS (SELECT 1 FROM updated);`,
      ['7', 'u1']
    );
  });

  test('returns 404 when todo is not found', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/todos/7')
      .set(authForUser('u1'))
      .expect(404, { error: 'Todo not found' });
  });

  test('returns 500 when the get query fails', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .get('/todos/7')
      .set(authForUser('u1'))
      .expect(500, { error: 'Internal server error' });
  });
});

describe('PUT /todos/:id', () => {
  test('returns 404 when todo does not exist for the user', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'x' })
      .expect(404, { error: 'Todo not found' });
  });

  test('rejects an empty update body', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({})
      .expect(400, { error: 'No fields to update' });

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  test('updates only provided fields and permits nullable fields', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'updated', description: null, category: null };

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated', description: null, category: null })
      .expect(200);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'UPDATE todos SET title = $1, description = $2, category = $3, updated_at = NOW(), last_viewed = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
      ['updated', null, null, '7', 'u1']
    );
  });

  test('returns 500 when update query fails', async () => {
    const app = loadApp();
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated' })
      .expect(500, { error: 'Internal server error' });
  });

  test('single-field updates skip the existence-check query', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'updated' };

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated' })
      .expect(200);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenNthCalledWith(1, upsertSql(), ['u1']);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'UPDATE todos SET title = $1, updated_at = NOW(), last_viewed = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      ['updated', '7', 'u1']
    );
  });

  test('updates only provided fields when fields are omitted (not explicitly null)', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'updated', category: null };

    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated', category: null })
      .expect(200);

    expect(res.body).toEqual(row);

    const [updateSql, updateParams] = queryMock.mock.calls[1];
    expect(updateSql).toContain('title = $1');
    expect(updateSql).toContain('category = $2');
    expect(updateSql).not.toContain('description =');
    expect(updateSql).not.toContain('status =');
    expect(updateSql).not.toContain('priority =');
    expect(updateSql).toContain('updated_at = NOW()');
    expect(updateSql).toContain('last_viewed = NOW()');
    expect(updateParams).toEqual(['updated', null, '7', 'u1']);
  });
});

describe('DELETE /todos/:id', () => {
  test('deletes the todo scoped by id and user', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'gone' };
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .delete('/todos/7')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body).toEqual({ message: 'Todo deleted successfully', deletedTodo: row });
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
      ['7', 'u1']
    );
  });

  test('returns 404 when deleting a missing todo', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .delete('/todos/7')
      .set(authForUser('u1'))
      .expect(404, { error: 'Todo not found' });
  });

  test('returns 500 when the delete query fails', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .delete('/todos/7')
      .set(authForUser('u1'))
      .expect(500, { error: 'Internal server error' });
  });
});

describe('/metrics', () => {
  test.each([
    [0, '0s'],
    [61, '1m 1s'],
    [3661, '1h 1m 1s'],
    [90061, '1d 1h 1m 1s'],
  ])('reports uptime for %s seconds', async (seconds, readable) => {
    const app = loadApp('2024-01-01T00:00:00.000Z');
    queryMock.mockResolvedValueOnce({ rows: [] });
    jest.setSystemTime(new Date(Date.UTC(2024, 0, 1, 0, 0, seconds)));

    const res = await request(app)
      .get('/metrics')
      .set(authForUser('u1'))
      .expect(200);

    expect(res.body.uptime).toBe(seconds);
    expect(res.body.uptime_seconds).toBe(seconds);
    expect(res.body.uptime_readable).toBe(readable);
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});
