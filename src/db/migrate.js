async function ensureColumn(pool, tableName, columnDefinition) {
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnDefinition}`);
}

async function ensureIndex(pool, indexSql) {
  await pool.query(indexSql);
}

async function migrateDatabase(pool) {
  await ensureColumn(pool, 'users', 'email VARCHAR(255)');
  await ensureColumn(pool, 'todos', 'due_at TIMESTAMP');
  await ensureColumn(pool, 'todos', 'reminder_sent_at TIMESTAMP');

  await ensureIndex(pool, 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await ensureIndex(pool, 'CREATE INDEX IF NOT EXISTS idx_todos_user_due_at ON todos(user_id, due_at)');
  await ensureIndex(pool, 'CREATE INDEX IF NOT EXISTS idx_todos_user_reminder_sent_at ON todos(user_id, reminder_sent_at)');
  await ensureIndex(pool, "CREATE INDEX IF NOT EXISTS idx_todos_user_pending_due_at ON todos(user_id, status, due_at) WHERE status = 'pending'");
}

module.exports = { migrateDatabase };
