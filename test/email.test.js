const request = require('supertest');
const app = require('../server').app;

describe('Email Endpoints', () => {
  let queryMock;
  let endMock;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';

    queryMock = jest.fn().mockResolvedValue({ rows: [] });
    endMock = jest.fn((cb) => cb && cb());

    jest.doMock('pg', () => ({
      Pool: jest.fn(() => ({ query: queryMock, end: endMock })),
    }));
  });

  afterEach(() => {
    jest.dontMock('pg');
  });

  describe('GET /api/email/preferences', () => {
    it('should return null preferences for new user', async () => {
      // Mock getPreferences to return null (no preferences set)
      jest.doMock('../src/repositories/email-preferences', () => ({
        getPreferences: jest.fn().mockResolvedValue(null),
      }));

      const { app: testApp } = require('../server');
      const res = await request(testApp).get('/api/email/preferences').set(
        'Authorization',
        'Bearer test-token'
      );

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    it('should return existing preferences', async () => {
      // Mock getPreferences to return preferences
      jest.doMock('../src/repositories/email-preferences', () => ({
        getPreferences: jest.fn().mockResolvedValue({
          user_id: 'user123',
          notify_daily: true,
          smtp_config: {
            host: 'smtp.example.com',
            port: 587,
            user: 'user@example.com',
            pass: 'password123',
            secure: false,
          },
        }),
      }));

      const { app: testApp } = require('../server');
      const res = await request(testApp).get('/api/email/preferences').set(
        'Authorization',
        'Bearer test-token'
      );

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      expect(res.body.notify_daily).toBe(true);
      expect(res.body.smtp_config).toBeDefined();
    });
  });

  describe('PUT /api/email/preferences', () => {
    it('should update preferences', async () => {
      // Mock createOrUpdatePreferences
      jest.doMock('../src/repositories/email-preferences', () => ({
        createOrUpdatePreferences: jest.fn().mockResolvedValue({
          user_id: 'user123',
          notify_daily: false,
          smtp_config: null,
        }),
      }));

      const { app: testApp } = require('../server');
      const res = await request(testApp)
        .put('/api/email/preferences')
        .set('Authorization', 'Bearer test-token')
        .send({ notify_daily: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.preferences.notify_daily).toBe(false);
    });

    it('should ignore invalid notify_daily value', async () => {
      const { app: testApp } = require('../server');
      const res = await request(testApp)
        .put('/api/email/preferences')
        .set('Authorization', 'Bearer test-token')
        .send({ notify_daily: 'not-a-boolean' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('notify_daily must be a boolean');
    });
  });

  describe('DELETE /api/email/preferences', () => {
    it('should delete preferences', async () => {
      // Mock deletePreferences
      jest.doMock('../src/repositories/email-preferences', () => ({
        deletePreferences: jest.fn().mockResolvedValue(true),
      }));

      const { app: testApp } = require('../server');
      const res = await request(testApp)
        .delete('/api/email/preferences')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
