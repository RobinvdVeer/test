const { getPool } = require('../db/pool');

/**
 * Find todos with a due_date within the next `lookAheadDays` days
 * that have not yet been emailed about (or were last emailed more than
 * `minDaysSinceLastEmail` days ago).
 *
 * Returns: [{ user_id, id, title, description, category, priority, due_date, last_email_sent_at }]
 */
async function getUpcomingTodos({ lookAheadDays, minDaysSinceLastEmail }) {
  const lookAheadInterval = `interval '${lookAheadDays} days'`;
  const emailCooldownInterval = minDaysSinceLastEmail
    ? `interval '${minDaysSinceLastEmail} days'`
    : null;

  let query = `
    SELECT t.user_id, t.id, t.title, t.description, t.category, t.priority,
           t.due_date, t.email_sent_at
    FROM todos t
    WHERE t.due_date IS NOT NULL
      AND t.due_date <= NOW() + ${lookAheadInterval}
      AND t.due_date > NOW()
  `;

  const params = [];
  let paramCount = 1;

  if (emailCooldownInterval) {
    query += `
      AND (t.email_sent_at IS NULL
           OR t.email_sent_at < NOW() - ${emailCooldownInterval})
    `;
  }

  query += ` ORDER BY t.due_date ASC`;

  const result = await getPool().query(query, params);
  return result.rows;
}

/**
 * Mark todos as having been emailed about (set email_sent_at = NOW()).
 *
 * @param {Array<{user_id: string, id: number}>} todos - List of {user_id, id}
 * @returns {Promise<number>} Number of rows updated
 */
async function markAsEmailed(todos) {
  if (todos.length === 0) return 0;

  const query = `
    UPDATE todos
    SET email_sent_at = NOW()
    WHERE (user_id, id) IN (
      ${todos
        .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
        .join(', ')}
    )
  `;

  const params = [];
  for (const t of todos) {
    params.push(t.user_id, t.id);
  }

  const result = await getPool().query(query, params);
  return result.rowCount;
}

/**
 * Count todos per user that are due within the next `lookAheadDays` days.
 *
 * @param {object} opts
 * @param {number} opts.lookAheadDays
 * @param {number} [opts.minDaysSinceLastEmail]
 * @returns {Promise<Array<{user_id: string, count: number}>>}
 */
async function countUpcomingTodosPerUser({ lookAheadDays, minDaysSinceLastEmail }) {
  const lookAheadInterval = `interval '${lookAheadDays} days'`;
  const emailCooldownInterval = minDaysSinceLastEmail
    ? `interval '${minDaysSinceLastEmail} days'`
    : null;

  let query = `
    SELECT user_id, COUNT(*) as count
    FROM todos
    WHERE due_date IS NOT NULL
      AND due_date <= NOW() + ${lookAheadInterval}
      AND due_date > NOW()
  `;

  const params = [];
  let paramCount = 1;

  if (emailCooldownInterval) {
    query += ` AND (email_sent_at IS NULL OR email_sent_at < NOW() - ${emailCooldownInterval})`;
  }

  query += ' GROUP BY user_id';

  const result = await getPool().query(query, params);
  return result.rows;
}

module.exports = { getUpcomingTodos, markAsEmailed, countUpcomingTodosPerUser };
