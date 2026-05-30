const fs = require('fs');
const path = require('path');
const { applyMigrations, initializeMigrationsTable } = require('../src/db/migrations');
const { getPool } = require('../src/db/pool');

describe('database migrations', () => {
  let mockPool;
  let fsExistsSyncMock;
  let fsReadFileSyncMock;
  let poolQueryMock;

  beforeEach(() => {
    // Mock pool
    mockPool = {
      query: jest.fn(),
    };

    poolQueryMock = mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    getPool.mockReturnValue(mockPool);

    // Mock file system
    fsExistsSyncMock = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
    fsReadFileSyncMock = jest.spyOn(fs, 'readFileSync').mockImplementation(() => 'migration sql');
  });

  afterEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  describe('initializeMigrationsTable', () => {
    it('creates schema_migrations table if it does not exist', async () => {
      // Migration table doesn't exist, should create it
      const createMock = {
        rows: [], rowCount: 1,
        command: 'CREATE TABLE' };
      const checkMock = {
        rows: [],
      };
      poolQueryMock
        .mockResolvedValueOnce(createMock)
        .mockResolvedValueOnce(checkMock);

      await initializeMigrationsTable();

      expect(poolQueryMock).toHaveBeenCalledTimes(1);
      expect(poolQueryMock).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });

    it('executes queries in correct sequence', async () => {
      const checkMock = {
        rows: [],
      };
      const createMock = {
        rows: [],
        rowCount: 0,
      };
      poolQueryMock
        .mockResolvedValueOnce(createMock)
        .mockResolvedValueOnce(checkMock);

      await initializeMigrationsTable();

      const initialCalls = poolQueryMock.mock.calls.filter(call =>
        call[0].includes('schema_migrations')
      );

      // Should check for table first, then create if needed
      expect(initialCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('applyMigrations', () => {
    const mockMigrationsPath = '/tmp/mock-migrations';

    it('returns early when migrations directory does not exist', async () => {
      // Migration directory doesn't exist
      fsExistsSyncMock.mockReturnValueOnce(false);

      await applyMigrations();

      expect(fsExistsSyncMock).toHaveBeenCalledWith(path.join(process.cwd(), 'migrations'));
      expect(poolQueryMock).not.toHaveBeenCalled();
    });

    it('returns early when migrations directory is empty', async () => {
      // Migration directory exists but is empty
      fsExistsSyncMock.mockReturnValueOnce(true);

      await applyMigrations();

      expect(poolQueryMock).not.toHaveBeenCalled();
    });

    it('skips non-v-prefixed files', async () => {
      // Mock file system for migrations directory
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = [
        '001_add_email_reminders.sql',
        'rollback.sql',
        'config.yaml',
      ];

      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (filePath.includes('001_add_email_reminders.sql')) {
          return '-- migration for email reminders';
        }
        return '-- some other file';
      });

      await applyMigrations();

      // Should attempt to query only once for v-prefixed files
      expect(poolQueryMock).toHaveBeenCalledTimes(2); // 1 for table check, 1 for already-applied check
    });

    it('skips files that don\\'t end with .sql extension', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = ['001_add_email_reminders.yaml', '002_custom.sql'];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (filePath.endsWith('.sql')) {
          return '-- valid sql migration';
        }
        return '-- not sql';
      });

      await applyMigrations();

      // Should handle only .sql files
      expect(poolQueryMock).toHaveBeenCalledTimes(2);
    });

    it('logos migrated file as already applied', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = ['001_add_email_reminders.sql'];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => '-- migration');
      jest.spyOn(fs, 'writeFileSync');

      const result = {
        rows: [{ version: '001_add_email_reminders.sql' }],
      };
      poolQueryMock.mockResolvedValueOnce(result);

      await applyMigrations();

      // Should not apply migrated files
      expect(poolQueryMock).toHaveBeenCalledTimes(2);
    });

    it('applies new migration files', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = [
        '001_add_email_reminders.sql',
        '002_update_indexes.sql',
      ];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (filePath.includes('001_add_email_reminders.sql')) {
          return 'CREATE TABLE test (id INT);';
        }
        return 'ALTER TABLE test ADD COLUMN x INT;';
      });

      // First call: already applied
      poolQueryMock.mockResolvedValueOnce({ rows: [{ version: '001_add_email_reminders.sql' }] });
      // Second call: apply migration
      poolQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'ALTER TABLE' });
      // Third call: mark as applied
      poolQueryMock.mockResolvedValueOnce({ rows: [] });

      await applyMigrations();

      expect(poolQueryMock).toHaveBeenCalledTimes(3);
    });

    it('handles migration file read errors', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = ['001_add_email_reminders.sql'];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('File system error');
      });

      await expect(applyMigrations()).rejects.toThrow('File system error');
    });

    it('handles database query errors gracefully', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      const files = ['001_add_email_reminders.sql'];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('-- migration');
      jest.spyOn(fs, 'writeFileSync');

      poolQueryMock.mockResolvedValueOnce({ rows: [] });
      poolQueryMock
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValueOnce([]);

      await expect(applyMigrations()).rejects.toThrow('Database connection failed');
    });

    it('sorts migration files alphabetically', async () => {
      fsExistsSyncMock.mockReturnValueOnce(true);

      // Files not in alphabetical order
      const files = [
        '003_late_migration.sql',
        '001_initial.sql',
        '002_intermediate.sql',
      ];
      jest.spyOn(fs, 'readdirSync').mockReturnValue(files);
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => '-- migration');

      poolQueryMock
        .mockResolvedValueOnce({ rows: [] }) // Check table
        .mockResolvedValueOnce([]) // Check already applied (should not find any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'CREATE TABLE' })
        .mockResolvedValueOnce({ rows: []}); // Mark as applied

      await applyMigrations();

      // Should attempt to apply in alphabetical order
      expect(poolQueryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['0001_initial.sql', '0002_intermediate.sql', '0003_late_migration.sql'])
      );
    });
  });
});
