const { getPool } = require('../db/pool');

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const knownUsers = new Map();

function rememberUser(userId, email, nowMs = Date.now()) {
  knownUsers.set(userId, { seenAt: nowMs, email: email || null });
}

function shouldSkipUpsert(userId, email, nowMs = Date.now()) {
  const entry = knownUsers.get(userId);
  if (!entry) return false;
  if (nowMs - entry.seenAt >= USER_CACHE_TTL_MS) return false;
  if (email && entry.email !== email) return false;
  return true;
}

async function upsertUser(userId, { email } = {}) {
  if (shouldSkipUpsert(userId, email)) {
    return;
  }

  if (email) {
    await getPool().query(
      'INSERT INTO users (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)',
      [userId, email]
    );
  } else {
    await getPool().query(
      'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
  }

  rememberUser(userId, email);
}

async function ensureUserExists(userId, email) {
  return upsertUser(userId, { email });
}

module.exports = { upsertUser, ensureUserExists };
