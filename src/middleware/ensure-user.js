const { ensureUserExists } = require('../repositories/usersRepository');

async function ensureUserMiddleware(req, res, next) {
  try {
    await ensureUserExists(req.userId);
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { ensureUserMiddleware };
