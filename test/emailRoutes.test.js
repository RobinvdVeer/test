const request = require('supertest');
const crypto = require('crypto');

let queryMock;
let endMock;
let jwks;
let privateKey;
let app;

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
  jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
  process.env.KEYCLOAK_ISSUER_URL = 'https://keycloak.local/roundrealms/todos';
  process.env.KEYCLOAK_JWKS_URL = 'https://keycloak.local/roundrealms/todos/protocol/openid-connect/certs';
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

function upsertSql() {
  return 'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING';
}

afterEach(() => {
  jest.useRealTimers();
  jest.dontMock('pg');
});

describe('GET /api/me/email-reminders/config', () => {
  it('returns default configuration when no config exists for user', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/me/email-reminders/config').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.frequency_millis).toBe(24 * 60 * 60 * 1000);
    expect(res.body.frequency_hours).toBe(24);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns stored configuration when exists', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [{ frequency_millis: 12 * 60 * 60 * 1000, active: true, created_at: '2024-01-01' }] });

    const res = await request(app).get('/api/me/email-reminders/config').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);
    expect(res.body.frequency_millis).toBe(12 * 60 * 60 * 1000);
    expect(res.body.frequency_hours).toBe(12);
  });
});

describe('PUT /api/me/email-reminders/config', () => {
  it('updates configuration with valid inputs', async () => {
    const app = loadApp();
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ frequency_millis: 6 * 60 * 60 * 1000, active: true }] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ frequency_hours: 6, active: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.config.frequency_hours).toBe(6);
    expect(res.body.config.frequency_millis).toBe(6 * 60 * 60 * 1000);
  });

  it('rejects invalid frequency_hours value (< 1)', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ frequency_hours: 0, active: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('frequency_hours must be a positive number');
  });

  it('rejects invalid frequency_hours value (> 720)', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ frequency_hours: 721, active: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('frequency_hours cannot exceed 720 hours (30 days)');
  });

  it('rejects non-numeric frequency_hours', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ frequency_hours: 'invalid', active: true });


    expect(res.status).toBe(400);
    expect(res.body.error).toBe('frequency_hours must be a positive number');
  });

  it('updates only active when missing frequency_hours', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects non-boolean active', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put('/api/me/email-reminders/config')
      .set(authForUser('user-1'))
      .send({ frequency_hours: 12, active: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('active must be a boolean');
  });
});

describe('GET /api/me/email-reminders/last-sent', () => {
  it('returns null when no previous email sent', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/me/email-reminders/last-sent').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.last_email_sent).toBeNull();
    expect(res.body.last_checked_at).toBeNull();
  });

  it('returns last sent timestamp when exists', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [{ last_email_sent: '2024-01-10T10:00:00Z', last_checked_at: '2024-01-10T10:00:00Z' }] });

    const res = await request(app).get('/api/me/email-reminders/last-sent').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.last_email_sent).toBe('2024-01-10T10:00:00Z');
    expect(res.body.last_checked_at).toBe('2024-01-10T10:00:00Z');
  });
});

describe('GET /api/me/email-reminders/due-todos', () => {
  it('returns user\'s due todos', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 1, user_id: 'user-1', title: 'Task 1', due_date: '2024-01-02T10:00:00Z', status: 'pending' },
        { id: 2, user_id: 'user-1', title: 'Task 2', due_date: '2024-01-03T10:00:00Z', status: 'pending' },
      ],
    });

    const res = await request(app).get('/api/me/email-reminders/due-todos').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.todos).toHaveLength(2);
  });
});

describe('POST /api/email-reminders/send-all', () => {
  it('returns 400 when email configuration not available', async () => {
    const app = loadApp();
    app.set('emailConfig', undefined);

    const res = await request(app).post('/api/email-reminders/send-all').set(authForUser('user-1'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email configuration not available. Please provide email settings.');
  });

  it('returns success when config exists', async () => {
    const app = loadApp();

    let mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
    };

    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => mockTransporter),
    }));

    app.set('emailConfig', {
      frontendUrl: 'http://localhost:3000',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user@example.com',
      smtpPass: 'password',
      fromEmail: 'noreply@example.com',
      secure: false,
    });

    // Mock email reminder service
    queryMock
      .mockResolvedValueOnce({ rows: [{ frequency_millis: 86400000 }] })
      .mockResolvedValueOnce({ rows: [{ last_email_sent: null }] })
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', title: 'Task 1', due_date: '2024-01-16T10:00:00Z', status: 'pending' },
        ],
      });

    const res = await request(app).post('/api/email-reminders/send-all').set(authForUser('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when configuration is missing fields', async () => {
    const app = loadApp();
    app.set('emailConfig', {
      frontendUrl: 'http://localhost:3000',
      // Missing smtpHost
    });

    const res = await request(app).post('/api/email-reminders/send-all').set(authForUser('user-1'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email configuration not available. Please provide email settings.');
  });
});

describe('authentication and authorization', () => {
  it('requires authentication for all email reminder endpoints', async () => {
    const app = loadApp();
    queryMock.mockResolvedValueOnce({ rows: [] });

    const endpoints = [
      { method: 'get', path: '/api/me/email-reminders/config' },
      { method: 'put', path: '/api/me/email-reminders/config', body: { frequency_hours: 12 } },
      { method: 'get', path: '/api/me/email-reminders/last-sent' },
      { method: 'get', path: '/api/me/email-reminders/due-todos' },
      { method: 'post', path: '/api/email-remappers/send-all' },
    ];

    for (const endpoint of endpoints) {
      const res = await request(app)[endpoint.method](endpoint.path).send(endpoint.body || {});

      if (endpoint.path.includes('/api/email-reminders/send-all') && endpoint.body) {
        app.set('emailConfig', { frontendUrl: 'http://localhost:3000' });
      }

      expect(res.status).toBe(401);
      expect(/response code 401|Unauthorized/network error/i.test(res.status.toString())).toBe(true);
    }
  });
});
