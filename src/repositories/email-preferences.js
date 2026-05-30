const { getPool } = require('../db/pool');

async function createOrUpdatePreferences(userId, preferences) {
  const { notify_daily, smtp_config } = preferences;

  await getPool().query(
    `INSERT INTO user_preferences (user_id, notify_daily, smtp_config)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
     SET notify_daily = EXCLUDED.notify_daily,
         smtp_config = EXCLUDED.smtp_config
     WHERE user_preferences.user_id = $1`,
    [userId, notify_daily !== undefined ? notify_daily : true, smtp_config || null]
  );

  return { user_id: userId, notify_daily, smtp_config };
}

async function getPreferences(userId) {
  const result = await getPool().query(
    'SELECT user_id, notify_daily, smtp_config FROM user_preferences WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const userPreferences = {
    user_id: result.rows[0].user_id,
    notify_daily: result.rows[0].notify_daily !== false,
    smtp_config: result.rows[0].smtp_config,
  };

  // Parse SMTP config if it's a JSON string
  if (userPreferences.smtp_config && typeof userPreferences.smtp_config === 'string') {
    try {
      userPreferences.smtp_config = JSON.parse(userPreferences.smtp_config);
    } catch (e) {
      // Invalid JSON, use as-is
    }
  }

  return userPreferences;
}

async function deletePreferences(userId) {
  await getPool().query('DELETE FROM user_preferences WHERE user_id = $1', [userId]);
  return true;
}

module.exports = {
  createOrUpdatePreferences,
  getPreferences,
  deletePreferences,
};
