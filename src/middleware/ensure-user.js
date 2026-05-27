const { upsertUser } = require('../repositories/usersRepository');
const { rememberUserSync, shouldSyncUser } = require('../services/userSyncCache');

async function ensureUserMiddleware(req, res, next) {
  try {
    if (shouldSyncUser(req.userId, req.userEmail)) {
      await upsertUser(req.userId, { email: req.userEmail });
      rememberUserSync(req.userId, req.userEmail);
    }
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { ensureUserMiddleware };
