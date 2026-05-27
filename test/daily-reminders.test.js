const { getNextRunDelayMs, runDailyReminderBatch, startDailyReminderScheduler } = require('../src/jobs/dailyReminders');

function makePool(rows) {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  };
}

describe('daily reminders job', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("AND t.status <> 'completed'"),
      ['2024-01-01', '2024-01-03']
    );
    expect(pool.query.mock.calls[0][0]).toContain('AND t.due_date BETWEEN $1::date AND $2::date');
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

  test('continues sending reminders when one recipient fails', async () => {
    const rows = [
      { email: 'alice@example.com', user_id: 'alice', id: 1, title: 'Alice task', due_date: '2024-01-01' },
      { email: 'bob@example.com', user_id: 'bob', id: 2, title: 'Bob task', due_date: '2024-01-02' },
    ];
    const pool = makePool(rows);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true });
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

    expect(result).toEqual({ sent: 1, skipped: false, recipients: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Error sending reminder email:',
      expect.objectContaining({ email: 'alice@example.com' })
    );

    const secondRequest = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(secondRequest.to).toBe('bob@example.com');
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

  test('schedules, reschedules, and stops the reminder loop', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const pool = makePool([]);
    const fetchImpl = jest.fn(async () => ({ ok: true }));
    const logger = { error: jest.fn() };
    const timers = [];
    const setTimeoutImpl = jest.fn((fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    });
    const clearTimeoutImpl = jest.fn();

    const scheduler = startDailyReminderScheduler({
      pool,
      config: {
        enabled: true,
        sendUrl: 'https://mailer.example/send',
        from: 'todo-app@example.com',
        runAtUtc: '08:00',
        lookaheadDays: 0,
        appBaseUrl: 'http://app.example',
      },
      fetchImpl,
      logger,
      setTimeoutImpl,
      clearTimeoutImpl,
    });

    expect(setTimeoutImpl).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);

    await timers[0].fn();
    expect(setTimeoutImpl).toHaveBeenCalledTimes(2);

    scheduler.stop();
    expect(clearTimeoutImpl).toHaveBeenCalledWith(2);
  });

  test('stop prevents rescheduling after a timer callback runs', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const pool = makePool([]);
    const fetchImpl = jest.fn(async () => ({ ok: true }));
    const logger = { error: jest.fn() };
    const timers = [];
    const setTimeoutImpl = jest.fn((fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    });
    const clearTimeoutImpl = jest.fn();

    const scheduler = startDailyReminderScheduler({
      pool,
      config: {
        enabled: true,
        sendUrl: 'https://mailer.example/send',
        from: 'todo-app@example.com',
        runAtUtc: '08:00',
        lookaheadDays: 0,
        appBaseUrl: 'http://app.example',
      },
      fetchImpl,
      logger,
      setTimeoutImpl,
      clearTimeoutImpl,
    });

    scheduler.stop();
    expect(clearTimeoutImpl).toHaveBeenCalledWith(1);

    await timers[0].fn();
    expect(setTimeoutImpl).toHaveBeenCalledTimes(1);
  });

  test('disabled scheduler does not schedule timers', () => {
    const pool = makePool([]);
    const setTimeoutImpl = jest.fn();
    const clearTimeoutImpl = jest.fn();

    const scheduler = startDailyReminderScheduler({
      pool,
      config: { enabled: false },
      setTimeoutImpl,
      clearTimeoutImpl,
    });

    expect(setTimeoutImpl).not.toHaveBeenCalled();
    expect(clearTimeoutImpl).not.toHaveBeenCalled();
    expect(scheduler.stop).toEqual(expect.any(Function));
  });

  test('calculates the next UTC run delay correctly', () => {
    const now = new Date('2024-01-01T07:30:00.000Z');

    expect(getNextRunDelayMs(now, '08:00')).toBe(30 * 60 * 1000);
    expect(getNextRunDelayMs(new Date('2024-01-01T08:00:00.000Z'), '08:00')).toBe(24 * 60 * 60 * 1000);
  });
});
