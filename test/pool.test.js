const { initializeDatabase, initializeMigrationsTable, getPool, closePool } = require('../src/db/pool');

describe('database pool utilities', () => {
  let mockPool;
  let queryMock;

  beforeEach(() => {
    queryMock = jest.fn();
    mockPool = {
      query: queryMock,
      end: jest.fn(),
    };
    getPool.mockReturnValue(mockPool);
  });

  afterEach(() => {
    jest.resetModules();
    jest.useRealTimers();
  });

  describe('initializeMigrationsTable', () => {
    it('creates schema_migrations table if it does not exist', async () => {
      // Table doesn't exist - should create it
      const createResult = { rows: [], rowCount: 1, command: 'CREATE TABLE' };
      queryMock.mockResolvedValueOnce(createResult).mockResolvedValueOnce({ rows: [] });

      await initializeMigrationsTable();

      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });

    it('executes queries successfully when table exists', async () => {
      const checkResult = { rows: [{ version: '001_test.sql' }] };
      queryMock.mockResolvedValueOnce(checkResult).mockResolvedValueOnce({ rows: [] });

      await initializeMigrationsTable();

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });

    it('does not cause errors when called multiple times', async () => {
      const createResult = { rows: [], rowCount: 0 };
      queryMock.mockResolvedValueOnce(createResult).mockResolvedValueOnce({ rows: [] });

      await initializeMigrationsTable();
      await initializeMigrationsTable();
      await initializeMigrationsTable();

      expect(queryMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('initializeDatabase', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('calls initializeMigrationsTable first', async () => {
      const tableResult = { rows: [], rowCount: 0 };
      const migrationResult = { rows: [], rowCount: 0, command: 'ALTER TABLE' };

      queryMock
        .mockResolvedValueOnce(tableResult)
        .mockResolvedValueOnce(migrationResult)
        .mockResolvedValueOnce([]);

      await initializeDatabase();

      expect(queryMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });

    it('calls initializeMigrationsTable and applyMigrations', async () => {
      const tableResult = { rows: [], rowCount: 0 };
      const migrationResult = { rows: [], rowCount: 0, command: 'ALTER TABLE' };
      const migrationResult2 = {
        rows: [],
        rowCount: 0,
        command: 'CREATE TABLE' };

      queryMock
        .mockResolvedValueOnce(tableResult)
        .mockResolvedValueOnce(migrationResult)
        .mockResolvedValueOnce(migrationResult2)
        .mockResolvedValueOnce([]);

      const pool = getPool();
      const poolQuery = pool.query;

      require('../src/db/migrations').applyMigrations = jest.fn(async () => {
        await poolQuery(
          "SELECT COUNT(*) FROM schema_migrations"
        );
        return { count: 2 };
      });

      await initializeDatabase();

      expect(require('../src/db/migrations').applyMigrations).toHaveBeenCalled();
    });

    it('re-throws errors from initialization', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(initializeDatabase()).rejects.toThrow('Database connection failed');
    });

    it('handles errors from initializeMigrationsTable', async () => {
      queryMock
        .mockRejectedValueOnce(new Error('Table creation failed'))
        .mockResolvedValueOnce([]);

      await expect(initializeDatabase()).rejects.toThrow('Table creation failed');

      // Verify applyMigrations was NOT called (since it throws)
      expect(queryMock.mock.calls.length).toBe(2);
    });

    it('handles errors from applyMigrations', async () => {
      const tableResult = { rows: [], rowCount: 0 };
      queryMock.mockResolvedValueOnce(tableResult);

      require('../src/db/migrations').applyMigrations = jest.fn(async () => {
        throw new Error('Migration execution failed');
      });

      await expect(initializeDatabase()).rejects.toThrow('Migration execution failed');
      expect(require('../src/db/migrations').applyMigrations).toHaveBeenCalled();
    });

    it('executes initializeMigrationsTable even when applyMigrations fails', async () => {
      const tableResult = { rows: [], rowCount: 0 };
      queryMock
        .mockResolvedValueOnce(tableResult)
        .mockRejectedValueOnce(new Error('applyMigrations failed'));

      await expect(initializeDatabase()).rejects.toThrow('applyMigrations failed');
      expect(queryMock.mock.calls.length).toBe(2);
    });
  });

  describe('getPool and closePool', () => {
    it('returns configured pool instance', () => {
      const pool = getPool();
      expect(pool).toBeDefined();
      expect(pool.query).toBeDefined();
    });

    it('returns same pool instance on multiple calls', () => {
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
    });

    it('closes pool gracefully', async () => {
      const mockPool = {
        query: jest.fn(),
        end: jest.fn(),
      };
      getPool.mockReturnValue(mockPool);

      await closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('handles closePool when pool is undefined', async () => {
      getPool.mockReturnValue(undefined);
      await closePool();
      expect(getPool).toHaveBeenCalled();
    });
  });
});
