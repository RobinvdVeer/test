const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');

/**
 * Apply pending migrations
 */
async function applyMigrations() {
  const pool = getPool();
  const migrationsPath = path.join(__dirname, '..', '..', 'migrations');

  if (!fs.existsSync(migrationsPath)) {
    console.log('No migrations directory found');
    return;
  }

  const files = fs.readdirSync(migrationsPath)
    .filter(file => file.endsWith('.sql') && file.startsWith('v'))
    .sort();

  for (const file of files) {
    const migrationName = file;

    // Check if this migration has been applied
    const result = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [migrationName]
    );

    if (result.rows.length === 0) {
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsPath, file), 'utf8');

      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [migrationName]
      );
      console.log(`Migration ${file} applied successfully`);
    } else {
      console.log(`Migration ${file} already applied, skipping`);
    }
  }
}

/**
 * Initialize migrations table if it doesn't exist
 */
async function initializeMigrationsTable() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = {
  applyMigrations,
  initializeMigrationsTable,
};
