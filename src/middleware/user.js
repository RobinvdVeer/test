const { pool } = require('../db/pool');

async function ensureUserExists(userId) {
  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

function userMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(400).json({ error: 'X-User-Id header is required' });
  }

  req.userId = userId;

  ensureUserExists(userId)
    .then(() => next())
    .catch((error) => {
      console.error('Error ensuring user exists:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
}

module.exports = { userMiddleware };
