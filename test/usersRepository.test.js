describe('usersRepository', () => {
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    queryMock = jest.fn().mockResolvedValue({ rows: [] });
    jest.doMock('../src/db/pool', () => ({
      getPool: () => ({ query: queryMock }),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.dontMock('../src/db/pool');
  });

  test('caches repeated user/email pairs but refreshes when the email changes', async () => {
    const { ensureUserExists } = require('../src/repositories/usersRepository');

    await ensureUserExists('user-1', 'user-1@example.com');
    await ensureUserExists('user-1', 'user-1@example.com');
    await ensureUserExists('user-1', 'new-user-1@example.com');

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO users (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)',
      ['user-1', 'user-1@example.com']
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO users (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)',
      ['user-1', 'new-user-1@example.com']
    );
  });
});
