const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');

async function ensureUserExists(userId) {
  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );
}

function userMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Authorization bearer token is required' });
  }

  const token = authHeader.slice('Bearer '.length);
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let userId;
  try {
    const payload = jwt.verify(token, jwtSecret);
    userId = payload?.sub ?? payload?.userId ?? payload?.user_id;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: 'Invalid token payload' });
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
