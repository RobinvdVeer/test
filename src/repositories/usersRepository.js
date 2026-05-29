const { getPool } = require('../db/pool');

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX_ENTRIES = 10_000;
const knownUsers = new Map();

function isKnownUserFresh(userId, email, nowMs) {
  const entry = knownUsers.get(userId);
  if (!entry) return false;
  if (nowMs - entry.seenAt >= USER_CACHE_TTL_MS) return false;
  if (email && entry.email !== email) return false;
  return true;
}

function rememberUser(userId, nowMs, email) {
  knownUsers.set(userId, { seenAt: nowMs, email: email || null });

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

async function ensureUserExists(userId, email = null) {
  const nowMs = Date.now();
  if (isKnownUserFresh(userId, email, nowMs)) return;

  await getPool().query(
    'INSERT INTO users (user_id, email) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)',
    [userId, email]
  );

  rememberUser(userId, nowMs, email);
}

module.exports = { ensureUserExists };
