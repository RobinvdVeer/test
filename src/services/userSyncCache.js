const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX_ENTRIES = 10_000;
const knownUsers = new Map();

function isFresh(userId, nowMs, email) {
  const entry = knownUsers.get(userId);
  if (!entry) return false;

  const sameEmail = !email || entry.email === email;
  return nowMs - entry.seenAt < USER_CACHE_TTL_MS && sameEmail;
}

function shouldSyncUser(userId, email, nowMs = Date.now()) {
  return !isFresh(userId, nowMs, email);
}

function rememberUserSync(userId, email, nowMs = Date.now()) {
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

module.exports = {
  rememberUserSync,
  shouldSyncUser,
};
