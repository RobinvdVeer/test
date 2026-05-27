const { getPool } = require('../db/pool');

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX_ENTRIES = 10_000;
const knownUsers = new Map();

function rememberUser(userId, nowMs, email) {
  knownUsers.set(userId, {
    seenAt: nowMs,
    email: email || null,
  });

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

async function ensureUserExists(userId, email) {
  const nowMs = Date.now();
  const cachedEntry = knownUsers.get(userId);
  if (cachedEntry && nowMs - cachedEntry.seenAt < USER_CACHE_TTL_MS && (!email || cachedEntry.email === email)) {
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

  rememberUser(userId, nowMs, email);
}

module.exports = { ensureUserExists };
