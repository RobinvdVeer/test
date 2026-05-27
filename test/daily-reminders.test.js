const { getNextRunDelayMs, runDailyReminderBatch } = require('../src/jobs/dailyReminders');

function makePool(rows) {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  };
}

describe('daily reminders job', () => {
  test('sends one reminder email per recipient with due todos in the lookahead window', async () => {
    const rows = [
      { email: 'alice@example.com', user_id: 'alice', id: 1, title: 'Today task', due_date: '2024-01-01' },
      { email: 'alice@example.com', user_id: 'alice', id: 2, title: 'Soon task', due_date: '2024-01-03' },
      { email: 'bob@example.com', user_id: 'bob', id: 3, title: 'Bob task', due_date: '2024-01-02' },
    ];
    const pool = makePool(rows);
    const fetchImpl = jest.fn(async () => ({ ok: true }));
    const logger = { error: jest.fn() };

    const result = await runDailyReminderBatch({
      pool,
      config: {
        enabled: true,
        sendUrl: 'https://mailer.example/send',
        from: 'todo-app@example.com',
        apiKey: 'secret',
        runAtUtc: '08:00',
        lookaheadDays: 2,
        appBaseUrl: 'http://app.example',
      },
      fetchImpl,
      now: () => new Date('2024-01-01T00:00:00.000Z'),
      logger,
    });

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM todos t'), [
      '2024-01-01',
      '2024-01-03',
    ]);
    expect(result).toEqual({ sent: 2, skipped: false, recipients: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [firstUrl, firstRequest] = fetchImpl.mock.calls[0];
    expect(firstUrl).toBe('https://mailer.example/send');
    expect(firstRequest.headers.authorization).toBe('Bearer secret');
    expect(JSON.parse(firstRequest.body)).toMatchObject({
      from: 'todo-app@example.com',
      to: 'alice@example.com',
      subject: 'Todo reminders for 2024-01-01 to 2024-01-03',
    });
    expect(JSON.parse(firstRequest.body).text).toContain('Today task');
    expect(JSON.parse(firstRequest.body).text).toContain('Soon task');
    expect(JSON.parse(firstRequest.body).text).toContain('http://app.example');
  });

  test('does nothing when disabled', async () => {
    const pool = makePool([]);
    const fetchImpl = jest.fn();

    const result = await runDailyReminderBatch({
      pool,
      config: { enabled: false },
      fetchImpl,
    });

    expect(result).toEqual({ sent: 0, skipped: true });
    expect(pool.query).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('calculates the next UTC run delay correctly', () => {
    const now = new Date('2024-01-01T07:30:00.000Z');

    expect(getNextRunDelayMs(now, '08:00')).toBe(30 * 60 * 1000);
    expect(getNextRunDelayMs(new Date('2024-01-01T08:00:00.000Z'), '08:00')).toBe(24 * 60 * 60 * 1000);
  });
});
