const emailReminderService = require('../src/services/emailReminder');

describe('emailReminderService', () => {
  let pool;

  beforeEach(() => {
    // Mock the getPool function
    pool = {
      query: jest.fn(),
    };
    jest.doMock('../src/db/pool', () => ({
      getPool: jest.fn(() => pool),
    }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('getDueTodos', () => {
    const userId = 'user-1';

    it('returns todos due within 2 days', async () => {
      const dueTodos = [
        { id: 1, user_id: userId, title: 'Task 1', due_date: '2024-01-15T10:00:00Z', status: 'pending' },
        { id: 2, user_id: userId, title: 'Task 2', due_date: '2024-01-16T10:00:00Z', status: 'pending' },
      ];

      pool.query.mockResolvedValueOnce({ rows: dueTodos });

      const result = await emailReminderService.getDueTodos(userId);

      expect(result).toEqual(dueTodos);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('due_date IS NOT NULL AND due_date <='),
        [userId, expect.any(Date)]
      );
    });

    it('filters out completed todos', async () => {
      const dueTodos = [
        { id: 1, user_id: userId, title: 'Completed Task', due_date: '2024-01-15T10:00:00Z', status: 'completed' },
        { id: 2, user_id: userId, title: 'Pending Task', due_date: '2024-01-16T10:00:00Z', status: 'pending' },
      ];

      pool.query.mockResolvedValueOnce({ rows: dueTodos });

      const result = await emailReminderService.getDueTodos(userId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    it('filters out todos without due_date', async () => {
      const dueTodos = [
        { id: 1, user_id: userId, title: 'Task Without Due Date', due_date: null, status: 'pending' },
      ];

      pool.query.mockResolvedValueOnce({ rows: dueTodos });

      const result = await emailReminderService.getDueTodos(userId);

      expect(result).toHaveLength(0);
    });

    it('includes todos past due date', async () => {
      const dueTodos = [
        { id: 1, user_id: userId, title: 'Overdue Task', due_date: '2024-01-01T10:00:00Z', status: 'pending' },
      ];

      pool.query.mockResolvedValueOnce({ rows: dueTodos });

      const result = await emailReminderService.getDueTodos(userId);

      expect(result).toHaveLength(1);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('due_date <='),
        [userId, expect.any(Date)]
      );
    });

    it('sorts by due_date in ascending order', async () => {
      const dueTodos = [
        { id: 3, user_id: userId, title: 'Task 3', due_date: '2024-01-17T10:00:00Z', status: 'pending' },
        { id: 1, user_id: userId, title: 'Task 1', due_date: '2024-01-15T10:00:00Z', status: 'pending' },
      ];

      pool.query.mockResolvedValueOnce({ rows: dueTodos });

      const result = await emailReminderService.getDueTodos(userId);

      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('due_date', '2024-01-15T10:00:00Z');
    });
  });

  describe('getLastEmailSent', () => {
    const userId = 'user-1';

    it('returns null when no previous email', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await emailReminderService.getLastEmailSent(userId);

      expect(result).toBeNull();
    });

    it('returns last email timestamp when exists', async () => {
      const lastSent = '2024-01-10T10:00:00Z';
      pool.query.mockResolvedValueOnce({ rows: [{ last_email_sent: lastSent }] });

      const result = await emailReminderService.getLastEmailSent(userId);

      expect(result).toBe(lastSent);
    });
  });

  describe('updateLastEmailSent', () => {
    const userId = 'user-1';

    it('inserts status for new user', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      await emailReminderService.updateLastEmailSent(userId);

      expect(pool.query).toHaveBeenCalledWith(
        `INSERT INTO email_reminder_status (user_id, last_email_sent) VALUES ($1, NOW()) ON CONFLICT (user_id) DO UPDATE SET last_email_sent = NOW()`,
        [userId]
      );
    });
  });

  describe('getMaxFrequency', () => {
    const userId = 'user-1';

    it('returns default frequency when no config exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await emailReminderService.getMaxFrequency(userId);

      expect(result).toBe(24 * 60 * 60 * 1000);
    });

    it('returns custom frequency when config exists', async () => {
      const customFrequency = 12 * 60 * 60 * 1000;
      pool.query.mockResolvedValueOnce({ rows: [{ frequency_millis: customFrequency }] });

      const result = await emailReminderService.getMaxFrequency(userId);

      expect(result).toBe(customFrequency);
    });
  });

  describe('canSendEmail', () => {
    const userId = 'user-1';

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true for new users with no last email', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // getLastEmailSent returns null
        .mockResolvedValueOnce({ rows: [] }); // getMaxFrequency returns default

      pool.query.mockResolvedValueOnce({ rows: [{ frequency_millis: 86400000 }] });

      const result = await emailReminderService.canSendEmail(userId);

      expect(result).toBe(true);
    });

    it('returns true when enough time has passed', async () => {
      const lastSent = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      pool.query
        .mockResolvedValueOnce({ rows: [{ last_email_sent: lastSent }] })
        .mockResolvedValueOnce({ rows: [{ frequency_millis: 50 * 60 * 60 * 1000 }] }); // 50 hour window

      const result = await emailReminderService.canSendEmail(userId);

      expect(result).toBe(true);
    });

    it('returns false when not enough time has passed', async () => {
      const lastSent = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10 hours ago
      pool.query
        .mockResolvedValueOnce({ rows: [{ last_email_sent: lastSent }] })
        .mockResolvedValueOnce({ rows: [{ frequency_millis: 12 * 60 * 60 * 1000 }] }); // 12 hour window

      const result = await emailReminderService.canSendEmail(userId);

      expect(result).toBe(false);
    });

    it('handles timezone differences correctly', async () => {
      const lastSent = new Date(Date.now() - 25 * 60 * 60 * 1000 - 300000).toISOString(); // 25 hours 5 min ago
      pool.query
        .mockResolvedValueOnce({ rows: [{ last_email_sent: lastSent }] })
        .mockResolvedValueOnce({ rows: [{ frequency_millis: 24 * 60 * 60 * 1000 }] });

      const result = await emailReminderService.canSendEmail(userId);

      expect(result).toBe(true);
    });
  });

  describe('sendUserEmail', () => {
    let transporterMock;

    beforeEach(() => {
      transporterMock = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
      };

      pool.query.mockResolvedValueOnce({
        rows: [
          { user_id: 'user-1', email: 'test@example.com' },
        ],
      });
    });

    it('sends email with correct subject and HTML content', async () => {
      const todos = [
        { id: 1, title: 'Test Task', description: 'Test desc', due_date: '2024-01-16T00:00:00Z', status: 'pending' },
        { id: 2, title: 'Another Task', due_date: '2024-01-17T00:00:00Z', status: 'pending' },
        { id: 3, title: 'No Description Task', due_date: '2024-01-18T00:00:00Z', status: 'pending' },
      ];

      const config = {
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        secure: false,
        emailCheckInterval: 3600000,
      };

      await emailReminderService.sendUserEmail(transporterMock, 'user-1', todos, config);

      expect(transporterMock.sendMail).toHaveBeenCalledWith({
        from: 'noreply@example.com',
        to: 'test@example.com',
        subject: expect.stringContaining('2 tasks due soon'),
        html: expect.stringContaining('<h2>Due Soon Tasks</h2>'),
        html: expect.stringContaining('<li><strong>Test Task</strong>'),
        html: expect.stringContaining('<a href="http://localhost:3000/todos">View all todos</a>'),
      });
    });

    it('handles empty todos list', async () => {
      const config = {
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
      };

      await expect(
        emailReminderService.sendUserEmail(transporterMock, 'user-1', [], config)
      ).rejects.toThrow('User user-1 has no email address');
    });

    it('throws error when user not found in database', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const config = {
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
      };

      await expect(
        emailReminderService.sendUserEmail(transporterMock, 'nonexistent', [], config)
      ).rejects.toThrow('User nonexistent not found');
    });
  });

  describe('triggerNow', () => {
    let transporterMock;

    beforeEach(() => {
      transporterMock = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ frequency_millis: 86400000 }] })
        .mockResolvedValueOnce({ rows: [{ last_email_sent: null }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, user_id: 'user-1', title: 'Task 1', due_date: '2024-01-16T10:00:00Z', status: 'pending' },
          ],
        });
    });

    it('returns success and failure counts', async () => {
      const config = {
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        secure: false,
      };

      const result = await emailReminderService.triggerNow(config);

      expect(result).toMatchObject({
        successCount: expect.any(Number),
        failureCount: expect.any(Number),
      });
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('scheduleReminderCheck', () => {
    let consoleLogSpy;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.useRealTimers();
      consoleLogSpy.mockRestore();
    });

    it('creates interval with configured check interval', () => {
      const checkInterval = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
      const config = {
        emailCheckInterval: checkInterval,
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
        smtpHost: 'smtp.example.com',
      };

      const intervalId = emailReminderService.scheduleReminderCheck(config);

      expect(typeof intervalId).toBe('number');
      expect(intervalId).toBeGreaterThan(0);

      // Clear the interval
      clearInterval(intervalId);
    });

    it('uses default interval when not configured', () => {
      const defaultInterval = 60 * 60 * 1000; // 1 hour
      const config = {
        emailCheckInterval: undefined,
        frontendUrl: 'http://localhost:3000',
        fromEmail: 'noreply@example.com',
        smtpHost: 'smtp.example.com',
      };

      const intervalId = emailReminderService.scheduleReminderCheck(config);

      expect(typeof intervalId).toBe('number');
      expect(intervalId).toBeGreaterThan(0);

      clearInterval(intervalId);
    });
  });
});
