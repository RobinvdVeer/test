const { getPool } = require('../db/pool');

async function upsertUser(userId, { email } = {}) {
  if (email) {
    await getPool().query(
      'INSERT INTO users (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)',
      [userId, email]
    );
    return;
  }

  await getPool().query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

module.exports = { upsertUser };
