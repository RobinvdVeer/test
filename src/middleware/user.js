const { pool } = require('../db/pool');

// Cache user existence checks to avoid a DB round-trip on every request.
// This is a best-effort optimization; users are still upserted when the
// cached value expires.
const USER_UPsert_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const USER_UPsert_CACHE_MAX_ENTRIES = 10_000;

const knownUsers = new Map(); // userId -> firstSeenAtMs

function isKnownUserFresh(userId, nowMs) {
  const firstSeenAt = knownUsers.get(userId);
  return firstSeenAt !== undefined && nowMs - firstSeenAt < USER_UPsert_CACHE_TTL_MS;
}

function rememberUser(userId, nowMs) {
  knownUsers.set(userId, nowMs);

  // Prune oldest entries if we exceed bounds.
  if (knownUsers.size > USER_UPsert_CACHE_MAX_ENTRIES) {
    const overflow = knownUsers.size - USER_UPsert_CACHE_MAX_ENTRIES;
    let i = 0;
    for (const [id] of knownUsers) {
      if (i >= overflow) break;
      knownUsers.delete(id);
      i += 1;
    }
  }
}

async function ensureUserExists(userId) {
  const nowMs = Date.now();
  if (isKnownUserFresh(userId, nowMs)) return;

  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );

  rememberUser(userId, nowMs);
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
