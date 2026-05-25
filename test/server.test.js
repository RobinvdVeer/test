const request = require('supertest');
const jwt = require('jsonwebtoken');

let queryMock;
let endMock;

function loadApp(now = '2024-01-01T00:00:00.000Z') {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(now));

  // Ensure required env vars for module initialization.
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://test:test@localhost:5432/testdb';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

  queryMock = jest.fn();
  endMock = jest.fn((cb) => cb && cb());
  jest.doMock('pg', () => ({
    Pool: jest.fn(() => ({ query: queryMock, end: endMock })),
  }));

  return require('../server').app;
}

function tokenForUser(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'test_jwt_secret');
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
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths['/api/docs/openapi.json']).toBeDefined();
    expect(res.body.paths['/metrics']).toBeDefined();
    expect(queryMock).not.toHaveBeenCalled();
  });

  test('serves /health without Bearer token', async () => {
    const app = loadApp();

    await request(app).get('/health').expect(200, { status: 'ok' });
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
      'UPDATE todos SET last_viewed = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
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
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });

    await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({})
      .expect(400, { error: 'No fields to update' });

    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  test('updates only provided fields and permits nullable fields', async () => {
    const app = loadApp();
    const row = { id: 7, title: 'updated', description: null, category: null };
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockResolvedValueOnce({ rows: [row] });

    const res = await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated', description: null, category: null })
      .expect(200);

    expect(res.body).toEqual(row);
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
      ['7', 'u1']
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      'UPDATE todos SET title = $1, description = $2, category = $3, updated_at = NOW(), last_viewed = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
      ['updated', null, null, '7', 'u1']
    );
  });

  test('returns 500 when update query fails', async () => {
    const app = loadApp();
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] })
      .mockRejectedValueOnce(new Error('fail'));

    await request(app)
      .put('/todos/7')
      .set(authForUser('u1'))
      .send({ title: 'updated' })
      .expect(500, { error: 'Internal server error' });
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
