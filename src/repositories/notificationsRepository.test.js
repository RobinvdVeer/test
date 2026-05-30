let queryMock;
let poolInstance;

function setupMocks() {
  jest.resetModules();

  queryMock = jest.fn();
  const endMock = jest.fn((cb) => cb && cb());

  poolInstance = { query: queryMock, end: endMock };

  jest.doMock('pg', () => ({
    Pool: jest.fn(() => poolInstance),
  }));

  jest.doMock('../db/pool', () => ({
    getPool: () => poolInstance,
  }));
}

beforeEach(() => {
  setupMocks();
  queryMock.mockReset();
});

afterEach(() => {
  jest.dontMock('pg');
  jest.dontMock('../db/pool');
});

describe('notificationsRepository', () => {
  describe('getUpcomingTodos', () => {
    test('returns todos with due dates within lookAheadDays', async () => {
      const { getUpcomingTodos } = require('../repositories/notificationsRepository');

      queryMock.mockResolvedValue({ rows: [] });
      const result = await getUpcomingTodos({ lookAheadDays: 2, minDaysSinceLastEmail: 0 });

      expect(queryMock).toHaveBeenCalled();
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('due_date IS NOT NULL');
      expect(sql).toContain('due_date <= NOW()');
      expect(sql).toContain('due_date > NOW()');
      expect(sql).toContain('ORDER BY t.due_date ASC');
      expect(result).toEqual([]);
    });

    test('applies email cooldown filter when minDaysSinceLastEmail > 0', async () => {
      const { getUpcomingTodos } = require('../repositories/notificationsRepository');

      queryMock.mockResolvedValue({ rows: [] });
      const result = await getUpcomingTodos({ lookAheadDays: 2, minDaysSinceLastEmail: 1 });

      expect(queryMock).toHaveBeenCalled();
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('email_sent_at IS NULL');
      expect(sql).toContain('email_sent_at < NOW()');
      expect(result).toEqual([]);
    });
  });

  describe('markAsEmailed', () => {
    test('updates email_sent_at for the given todos', async () => {
      const { markAsEmailed } = require('../repositories/notificationsRepository');

      queryMock.mockResolvedValue({ rowCount: 2 });

      await markAsEmailed([
        { user_id: 'u1', id: 1 },
        { user_id: 'u2', id: 2 },
      ]);

      expect(queryMock).toHaveBeenCalled();
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('UPDATE todos');
      expect(sql).toContain('email_sent_at = NOW()');
      expect(sql).toContain('(user_id, id) IN');
    });

    test('returns 0 when no todos provided', async () => {
      const { markAsEmailed } = require('../repositories/notificationsRepository');

      const result = await markAsEmailed([]);
      expect(result).toBe(0);
      expect(queryMock).not.toHaveBeenCalled();
    });

    test('returns rowCount from update', async () => {
      const { markAsEmailed } = require('../repositories/notificationsRepository');

      queryMock.mockResolvedValue({ rowCount: 3 });

      const result = await markAsEmailed([
        { user_id: 'u1', id: 1 },
        { user_id: 'u2', id: 2 },
        { user_id: 'u1', id: 3 },
      ]);

      expect(result).toBe(3);
    });
  });

  describe('countUpcomingTodosPerUser', () => {
    test('groups upcoming todos by user_id', async () => {
      const { countUpcomingTodosPerUser } = require('../repositories/notificationsRepository');

      queryMock.mockResolvedValue({ rows: [{ user_id: 'u1', count: 3 }, { user_id: 'u2', count: 1 }] });

      const result = await countUpcomingTodosPerUser({ lookAheadDays: 2 });

      expect(queryMock).toHaveBeenCalled();
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('GROUP BY user_id');
      expect(result).toEqual([{ user_id: 'u1', count: 3 }, { user_id: 'u2', count: 1 }]);
    });
  });
});
