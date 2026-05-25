const { upsertUser } = require('../repositories/usersRepository');

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

async function ensureUserProvisioned(userId) {
  const nowMs = Date.now();
  if (isKnownUserFresh(userId, nowMs)) return;

  await upsertUser(userId);
  rememberUser(userId, nowMs);
}

module.exports = { ensureUserProvisioned };
