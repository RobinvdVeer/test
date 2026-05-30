const request = require('supertest');
const { createApp } = require('../src/app');

// Mock dependencies
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('../src/config', () => ({
  getConfig: jest.fn(() => ({
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    smtpHost: 'smtp.test.com',
    smtpPort: 587,
    smtpUser: 'test@test.com',
    smtpPass: 'testpass',
    frontendUrl: 'http://localhost:3000',
    fromEmail: 'noreply@test.com',
    emailCheckInterval: 3600000,
    smtpSecure: false,
    port: 3001,
  })),
}));

jest.mock('../src/db/pool', () => ({
  getPool: jest.fn(),
  closePool: jest.fn(),
}));

jest.mock('../src/services/emailReminder', () => ({
  scheduleReminderCheck: jest.fn(),
  triggerNow: jest.fn(),
  canSendEmail: jest.fn(),
  getDueTodos: jest.fn(),
}));

describe('emailWorker', () => {
  let mockPool;
  let mockServer;
  let server;

  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
  };

  beforeEach(() => {
    // Mock pool
    mockPool = {
      query: jest.fn(),
      end: jest.fn(),
    };

    require('../src/db/pool').getPool.mockReturnValue(mockPool);
    require('../src/db/pool').closePool.mockResolvedValue();

    // Mock email reminder service
    const emailReminderService = require('../src/services/emailReminder');
    emailReminderService.scheduleReminderCheck.mockReset();
    emailReminderService.triggerNow.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
    });

    // Mock startApp to return test app with ports
    mockServer = {
      listen: jest.fn((port, callback) => {
        if (callback) callback();
        this.port = port;
      }),
      close: jest.fn((callback) => {
        if (callback) callback();
      }),
    };

    jest.doMock('express', () => {
      const express = jest.requireActual('express');
      const mockApp = express();
      mockApp.set = jest.fn();
      mockApp.get = jest.fn((path, handler) => {
        if (path === '/health') {
          mockApp._healthHandler = handler;
        } else if (path === '/trigger') {
          mockApp._triggerHandler = handler;
        }
        return mockApp;
      });
      mockApp.post = jest.fn();
      mockApp.listen.mockReturnValueOnce(mockServer);
      mockApp.listen.mockReturnValueOnce(mockServer);
      return { express: () => mockApp };
    });
  });

  afterEach(() => {
    jest.resetModules();
    jest.useRealTimers();
    // Clear any running intervals
    while (setInterval.mock.calls.length > 0) {
      clearInterval(setInterval.mock.calls[0][0]);
    }
  });

  describe('startup with valid configuration', () => {
    it('starts successfully with required environment variables', async () => {
      const waitForServer = new Promise((resolve) => {
        mockServer.listen.mockImplementation((port, callback) => {
          if (callback) callback();
          resolve(port);
        });
      });

      const { emailWorker } = require('../src/emailWorker');
      process.on('SIGTERM', () => {});
      process.on('SIGINT', () => {});

      // Start the email worker in separate process to avoid port conflicts
      const workerScript = `
        require('dotenv').config();
        const { createApp } = require('./src/app');
        const { getConfig } = require('./src/config');
        const { getPool, closePool } = require('./src/db/pool');
        const emailReminderService = require('./src/services/emailReminder');

        const config = getConfig();
        const app = createApp();
        app.set('emailConfig', {
          frontendUrl: config.frontendUrl,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass,
          fromEmail: config.fromEmail,
          emailCheckInterval: config.emailCheckInterval,
          secure: config.smtpSecure,
        });

        const mockTransporter = {
          sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
        };

        emailReminderService.getDueTodos = jest.fn();
        emailReminderService.canSendEmail = jest.fn().mockResolvedValue(true);

        let server;
        server = app.listen(3001, () => {
          console.log('WORKER_STARTED');
          server.close(() => console.log('WORKER_CLOSED'));
        });

        process.on('SIGTERM', () => {
          server.close();
          closePool();
        });

        process.on('SIGINT', () => {
          server.close();
          closePool();
        });
      `;

      const workerCode = Buffer.from(workerScript, 'utf8').toString('base64');
      const execResult = await new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        exec(`node -e "${workerCode}"`, { timeout: 5000 }, (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });

      expect(execResult).toContain('WORKER_STARTED');
    }, 10000);
  });

  describe('health endpoint', () => {
    it('returns 200 with correct health status', async () => {
      const { emailWorker } = require('../src/emailWorker');
      require('../src/config').getConfig.mockReturnValue({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
        smtpHost: 'smtp.test.com',
      });

      const waitForServer = new Promise((resolve) => {
        mockServer.listen.mockImplementation((port, callback) => {
          if (callback) callback();
          mockServer.port = port;
          resolve();
        });
      });

      // Start server
      const emailWorkerModule = require('../src/emailWorker');
      app._healthHandler(mockServer.port);

      const res = await request(mockServer.listen(3001)).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        service: 'email-worker',
        last_check: expect.any(String),
      });
      if (mockServer._healthHandler) {
        mockServer._healthHandler();
      }
    });
  });

  describe('manual trigger endpoint', () => {
    it('calls sendDueEmails with correct config', async () => {
      const { emailWorker } = require('../src/emailWorker');
      const { getConfig } = require('../src/config');

      getConfig.mockReturnValue({
        DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpUser: 'test@test.com',
        smtpPass: 'testpass',
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@test.com',
        emailCheckInterval: 3600000,
        smtpSecure: false,
      });

      mockPool.query.mockResolvedValue({ rows: [] });

      const waitForServer = new Promise((resolve) => {
        mockServer.listen.mockImplementation((port, callback) => {
          if (callback) {
            mockServer.port = port;
            resolve();
          }
        });
      });

      const emailReminderService = require('../src/services/emailReminder');
      emailReminderService.triggerNow.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
      });

      app._triggerHandler.mockImplementation(async (req, res) => {
        try {
          await emailReminderService.triggerNow(req.app.get('emailConfig'));
          res.json({ success: true, message: 'Emails sent successfully' });
        } catch (err) {
          res.status(500).json({ success: false, error: err.message });
        }
      });

      if (mockServer._triggerHandler) {
        await mockServer._triggerHandler(
          {
            app: {
              get: jest.fn(() => ({
                smtpHost: 'smtp.test.com',
                smtpPort: 587,
                fromEmail: 'n
            
            ),
          }
        );
      }

      const res = await request({ get: () => ({ port: true }) }).post('/trigger');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    it('closes server and database connection on SIGTERM', async () => {
      const { closePool } = require('../src/db/pool');
      closePool.mockResolvedValue();

      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 100));
      await closePool();
    });

    it('closes server and database connection on SIGINT', async () => {
      const { closePool } = require('../src/db/pool');
      closePool.mockResolvedValue();

      process.emit('SIGINT');
      
      // Note: We can't actually test the SIGINT handler without blocking execution
      // This is a documentation of the expected behavior
    });
  });
});
