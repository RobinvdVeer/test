const { createTodoReminderService } = require('../src/email/reminderService');

function makePool(rows) {
  return {
    query: jest
      .fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValue({ rowCount: 1, rows: [] }),
  };
}

describe('todo reminder emails', () => {
  test('sends reminder email for pending todos nearing their due date', async () => {
    const pool = makePool([
      {
        id: 7,
        title: 'Pay invoice',
        due_at: '2024-01-02T10:00:00.000Z',
        email: 'alice@example.com',
      },
    ]);
    const mailer = jest.fn().mockResolvedValue();
    const service = createTodoReminderService({
      pool,
      config: {
        enabled: true,
        dueSoonHours: 24,
        intervalMs: 1000,
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'mailer',
          password: 'secret',
          from: 'todos@example.com',
        },
      },
      mailer,
      logger: { error: jest.fn() },
    });

    const result = await service.runOnce();

    expect(result).toEqual({ enabled: true, scanned: 1, sent: 1 });
    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        from: 'todos@example.com',
        subject: 'Todo due soon: Pay invoice',
      })
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("t.status = 'pending'"),
      [24]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE todos SET reminder_sent_at = NOW() WHERE id = $1 AND reminder_sent_at IS NULL',
      [7]
    );
  });

  test('does nothing when reminders are disabled', async () => {
    const pool = { query: jest.fn() };
    const mailer = jest.fn();
    const service = createTodoReminderService({
      pool,
      config: {
        enabled: false,
        dueSoonHours: 24,
        intervalMs: 1000,
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: '',
          password: '',
          from: 'todos@example.com',
        },
      },
      mailer,
      logger: { error: jest.fn() },
    });

    const result = await service.runOnce();

    expect(result).toEqual({ enabled: false, scanned: 0, sent: 0 });
    expect(pool.query).not.toHaveBeenCalled();
    expect(mailer).not.toHaveBeenCalled();
  });
});
