const request = require('supertest');

const mockPool = {
  query: jest.fn(),
  end: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock('jwks-rsa', () =>
  jest.fn(() => ({
    getSigningKey: jest.fn((kid, callback) => {
      if (kid === 'bad-key') return callback(new Error('jwks lookup failed'));
      return callback(null, { getPublicKey: () => 'public-key' });
    }),
  }))
);

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, getKey, options, callback) => {
    const tokens = {
      'realm-alice': {
        sub: 'alice-sub',
        iss: 'http://issuer.test/realms/local-dev',
        aud: 'todo-app',
        realm_access: { roles: ['user'] },
      },
      'resource-alice': {
        sub: 'alice-sub',
        iss: 'http://issuer.test/realms/local-dev',
        aud: 'todo-app',
        resource_access: { 'todo-app': { roles: ['user'] } },
      },
      'bob': {
        sub: 'bob-sub',
        iss: 'http://issuer.test/realms/local-dev',
        aud: 'todo-app',
        realm_access: { roles: ['user'] },
      },
      'no-role': {
        sub: 'alice-sub',
        iss: 'http://issuer.test/realms/local-dev',
        aud: 'todo-app',
        realm_access: { roles: ['offline_access'] },
      },
      'wrong-issuer': {
        sub: 'alice-sub',
        iss: 'http://wrong-issuer.test/realms/local-dev',
        aud: 'todo-app',
        realm_access: { roles: ['user'] },
      },
      'wrong-audience': {
        sub: 'alice-sub',
        iss: 'http://issuer.test/realms/local-dev',
        aud: 'wrong-app',
        realm_access: { roles: ['user'] },
      },
    };

    if (token === 'jwks-error') {
      return getKey({ kid: 'bad-key' }, (error) => callback(error));
    }

    if (token === 'invalid' || token === 'expired') {
      return callback(new Error(token));
    }

    const decoded = tokens[token];
    if (!decoded) return callback(new Error('unknown token'));
    if (decoded.iss !== options.issuer) return callback(new Error('issuer mismatch'));
    if (decoded.aud !== options.audience) return callback(new Error('audience mismatch'));

    return callback(null, decoded);
  }),
}));

function auth(token = 'realm-alice') {
  return `Bearer ${token}`;
}

function installInMemoryDb(initialTodos = []) {
  const users = new Set();
  const todos = initialTodos.map((todo) => ({ ...todo }));
  let nextId = Math.max(0, ...todos.map((todo) => todo.id)) + 1;

  mockPool.query.mockImplementation(async (sql, params = []) => {
    if (sql.startsWith('INSERT INTO users')) {
      users.add(params[0]);
      return { rows: [] };
    }

    if (sql.startsWith('SELECT * FROM todos WHERE user_id')) {
      const [userId, category, status] = params;
      let rows = todos.filter((todo) => todo.user_id === userId);
      if (sql.includes('AND category')) rows = rows.filter((todo) => todo.category === category);
      if (sql.includes('AND status')) rows = rows.filter((todo) => todo.status === params[params.length - 1]);
      return { rows };
    }

    if (sql.startsWith('INSERT INTO todos')) {
      const [userId, title, description, category, status, priority] = params;
      const todo = { id: nextId++, user_id: userId, title, description, category, status, priority };
      todos.push(todo);
      return { rows: [todo] };
    }

    if (sql.startsWith('UPDATE todos SET last_viewed')) {
      const [id, userId] = params;
      const todo = todos.find((item) => item.id === Number(id) && item.user_id === userId);
      return { rows: todo ? [todo] : [] };
    }

    if (sql.startsWith('SELECT * FROM todos WHERE id')) {
      const [id, userId] = params;
      const todo = todos.find((item) => item.id === Number(id) && item.user_id === userId);
      return { rows: todo ? [todo] : [] };
    }

    if (sql.startsWith('UPDATE todos SET')) {
      const id = Number(params[params.length - 2]);
      const userId = params[params.length - 1];
      const todo = todos.find((item) => item.id === id && item.user_id === userId);
      if (!todo) return { rows: [] };
      if (sql.includes('title =')) todo.title = params[0];
      if (sql.includes('status =')) todo.status = params[0];
      return { rows: [todo] };
    }

    if (sql.startsWith('DELETE FROM todos')) {
      const [id, userId] = params;
      const index = todos.findIndex((item) => item.id === Number(id) && item.user_id === userId);
      if (index === -1) return { rows: [] };
      const [deleted] = todos.splice(index, 1);
      return { rows: [deleted] };
    }

    throw new Error(`Unhandled SQL in test: ${sql}`);
  });

  return { users, todos };
}

process.env.AUTH_ISSUER = 'http://issuer.test/realms/local-dev';
process.env.PUBLIC_AUTH_ISSUER = 'http://public-issuer.test/realms/local-dev';
process.env.AUTH_JWKS_URI = 'http://keycloak.test/certs';
process.env.AUTH_CLIENT_ID = 'todo-app';
process.env.AUTH_AUDIENCE = 'todo-app';
process.env.AUTH_REQUIRED_ROLE = 'user';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { app } = require('../server');

describe('auth discovery and CORS', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
  });

  test('GET /auth/config is public and returns OIDC PKCE settings', async () => {
    const response = await request(app).get('/auth/config').expect(200);

    expect(response.body).toEqual({
      issuer: 'http://public-issuer.test/realms/local-dev',
      clientId: 'todo-app',
      audience: 'todo-app',
      authorizationEndpoint: 'http://public-issuer.test/realms/local-dev/protocol/openid-connect/auth',
      tokenEndpoint: 'http://public-issuer.test/realms/local-dev/protocol/openid-connect/token',
      logoutEndpoint: 'http://public-issuer.test/realms/local-dev/protocol/openid-connect/logout',
      pkceMethod: 'S256',
    });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  test('OPTIONS preflight is public and returns CORS headers', async () => {
    const response = await request(app).options('/todos').expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');
    expect(response.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('JWT authentication for todo endpoints', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    installInMemoryDb();
  });

  test.each([
    ['missing authorization header', undefined, 401, 'Bearer token is required'],
    ['malformed bearer scheme', 'Basic abc', 401, 'Bearer token is required'],
    ['invalid token', auth('invalid'), 401, 'Invalid or expired bearer token'],
    ['expired token', auth('expired'), 401, 'Invalid or expired bearer token'],
    ['JWKS lookup failure', auth('jwks-error'), 401, 'Invalid or expired bearer token'],
    ['issuer mismatch', auth('wrong-issuer'), 401, 'Invalid or expired bearer token'],
    ['audience mismatch', auth('wrong-audience'), 401, 'Invalid or expired bearer token'],
  ])('%s is rejected', async (_name, header, status, error) => {
    const req = request(app).get('/todos');
    if (header) req.set('Authorization', header);

    const response = await req.expect(status);

    expect(response.body).toEqual({ error });
  });

  test('token without required user role is rejected', async () => {
    const response = await request(app).get('/todos').set('Authorization', auth('no-role')).expect(403);

    expect(response.body).toEqual({ error: "Required role 'user' is missing" });
  });

  test.each(['realm-alice', 'resource-alice'])('accepts user role from %s token and uses sub as user id', async (token) => {
    await request(app).get('/todos').set('Authorization', auth(token)).expect(200);

    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      ['alice-sub']
    );
    expect(mockPool.query.mock.calls[1][1][0]).toBe('alice-sub');
  });
});

describe('todo user isolation', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    installInMemoryDb([
      { id: 1, user_id: 'alice-sub', title: 'Alice todo', status: 'pending', category: 'work' },
      { id: 2, user_id: 'bob-sub', title: 'Bob todo', status: 'pending', category: 'work' },
    ]);
  });

  test('list only returns todos for the authenticated subject', async () => {
    const response = await request(app).get('/todos').set('Authorization', auth('realm-alice')).expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: 1, user_id: 'alice-sub', title: 'Alice todo' });
  });

  test('read returns 404 for another user todo', async () => {
    await request(app).get('/todos/2').set('Authorization', auth('realm-alice')).expect(404);
  });

  test('update returns 404 for another user todo', async () => {
    await request(app)
      .put('/todos/2')
      .set('Authorization', auth('realm-alice'))
      .send({ status: 'completed' })
      .expect(404);
  });

  test('delete returns 404 for another user todo', async () => {
    await request(app).delete('/todos/2').set('Authorization', auth('realm-alice')).expect(404);
  });
});

describe('database error handling', () => {
  let consoleError;

  beforeEach(() => {
    mockPool.query.mockReset();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test('ensureUserExists failure returns sanitized 500 and stops processing', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app).get('/todos').set('Authorization', auth()).expect(500);

    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['list todos', () => request(app).get('/todos').set('Authorization', auth())],
    ['create todo', () => request(app).post('/todos').set('Authorization', auth()).send({ title: 'New todo' })],
    ['read todo', () => request(app).get('/todos/1').set('Authorization', auth())],
    ['update initial existence check', () => request(app).put('/todos/1').set('Authorization', auth()).send({ title: 'Updated' })],
    ['delete todo', () => request(app).delete('/todos/1').set('Authorization', auth())],
  ])('%s query failure returns sanitized 500', async (_name, buildRequest) => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('query failed'));

    const response = await buildRequest().expect(500);

    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});
