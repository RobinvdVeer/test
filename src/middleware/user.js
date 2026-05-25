const { getConfig } = require('../config');
const { verifyJwt } = require('../auth/jwt');

let pool;
function getPool() {
  if (!pool) {
    ({ pool } = require('../db/pool'));
  }
  return pool;
}

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX_ENTRIES = 10_000;
const knownUsers = new Map();

function isKnownUserFresh(userId, nowMs) {
  const firstSeenAt = knownUsers.get(userId);
  return firstSeenAt !== undefined && nowMs - firstSeenAt < USER_CACHE_TTL_MS;
}

function rememberUser(userId, nowMs) {
  knownUsers.set(userId, nowMs);

  if (knownUsers.size > USER_CACHE_MAX_ENTRIES) {
    const overflow = knownUsers.size - USER_CACHE_MAX_ENTRIES;
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

  await getPool().query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );

  rememberUser(userId, nowMs);
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization bearer token is required' });
  }

  const token = authHeader.slice('Bearer '.length);
  const config = getConfig();

  let payload;
  try {
    payload = await verifyJwt(token, {
      issuer: config.auth.issuerUrl,
      jwksUrl: config.auth.jwksUrl,
      clientId: config.auth.clientId,
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid bearer token' });
  }

  if (!payload?.sub || typeof payload.sub !== 'string') {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  req.userId = payload.sub;

  try {
    await ensureUserExists(req.userId);
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  authMiddleware,
  userMiddleware: authMiddleware,
};
