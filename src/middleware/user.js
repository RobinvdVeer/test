const { resolveAuthenticatedUser } = require('../auth/requestAuth');
const { ensureUserProvisioned } = require('../services/userProvisioning');

async function userMiddleware(req, res, next) {
  const result = await resolveAuthenticatedUser({
    authHeader: req.headers.authorization,
    xUserId: req.headers['x-user-id'],
    reqPath: req.path,
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  req.userId = result.userId;

  try {
    await ensureUserProvisioned(result.userId);
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { userMiddleware };
