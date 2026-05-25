const { pool } = require('../db/pool');

async function upsertUser(userId) {
  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

module.exports = { upsertUser };
