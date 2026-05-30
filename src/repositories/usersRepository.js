const { getPool } = require('../db/pool');

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

/**
 * Upsert the email address for a user. Creates the row if it doesn't exist.
 */
async function upsertUserEmail(userId, email) {
  await getPool().query(
    `INSERT INTO users (user_id, email)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET email = $2`,
    [userId, email]
  );
}

/**
 * Retrieve the full email preference record for a user.
 */
async function getUserEmailPreferences(userId) {
  const result = await getPool().query(
    `SELECT email, email_enabled, email_frequency_hours, last_email_sent_at
     FROM users WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      email: null,
      email_enabled: false,
      email_frequency_hours: 24,
      last_email_sent_at: null,
    };
  }

  return {
    email: row.email || null,
    email_enabled: Boolean(row.email_enabled),
    email_frequency_hours: Number(row.email_frequency_hours) || 24,
    last_email_sent_at: row.last_email_sent_at || null,
  };
}

/**
 * Update email preferences for a user. Only fields present in `updates`
 * will be modified.
 */
async function updateUserEmailPreferences(userId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(updates.email);
  }
  if (updates.email_enabled !== undefined) {
    fields.push(`email_enabled = $${paramCount++}`);
    values.push(updates.email_enabled);
  }
  if (updates.email_frequency_hours !== undefined) {
    fields.push(`email_frequency_hours = $${paramCount++}`);
    values.push(Number(updates.email_frequency_hours) || 24);
  }
  if (updates.last_email_sent_at !== undefined) {
    fields.push(`last_email_sent_at = $${paramCount++}`);
    values.push(updates.last_email_sent_at || null);
  }

  if (fields.length === 0) {
    return await getUserEmailPreferences(userId);
  }

  values.push(userId);

  await getPool().query(
    `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${paramCount}`,
    values
  );

  return await getUserEmailPreferences(userId);
}

module.exports = {
  ensureUserExists,
  upsertUserEmail,
  getUserEmailPreferences,
  updateUserEmailPreferences,
};
