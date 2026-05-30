const path = require('path');
const fs = require('fs');
const { getPool } = require('../db/pool');
const { formatReminder } = require('./emailService');

/**
 * Returns the file path used as a lock to enforce the minimum interval
 * between notification runs. Uses a temp file so the scheduler works
 * across processes without external dependencies.
 */
function lockFilePath() {
  return path.join(__dirname, '..', '..', '.notification.lock');
}

/**
 * Reads the last notification timestamp from the lock file.
 * Returns null if the file doesn't exist.
 */
function readLastSentTime() {
  try {
    const content = fs.readFileSync(lockFilePath(), 'utf8');
    return Number.parseInt(content, 10);
  } catch {
    return null;
  }
}

/**
 * Writes the current timestamp to the lock file.
 */
function writeLastSentTime() {
  fs.writeFileSync(lockFilePath(), String(Date.now()), 'utf8');
}

/**
 * Queries todos that are pending/in-progress and have a due_date
 * less than `thresholdHours` from now. Groups them by user_id.
 * Returns an array of { userId, userName, todos: [...] }.
 */
async function getUpcomingTodos({ thresholdHours = 48 } = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.user_id, t.title, t.description, t.due_date
     FROM todos t
     JOIN users u ON t.user_id = u.user_id
     WHERE t.due_date <= NOW() + INTERVAL '${thresholdHours} hours'
       AND t.due_date > NOW()
       AND t.status IN ('pending', 'in_progress')
     ORDER BY t.user_id, t.due_date ASC`
  );

  // Group by user
  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.user_id]) {
      grouped[row.user_id] = [];
    }
    grouped[row.user_id].push({
      title: row.title,
      description: row.description,
      due_date: row.due_date,
    });
  }

  return Object.entries(grouped).map(([userId, todos]) => ({
    userId,
    userName: userId,
    todos,
  }));
}

/**
 * Checks whether enough time has elapsed since the last notification
 * based on the minIntervalMs configuration.
 * Returns { shouldSend: true } or { shouldSend: false, reason: '...' }.
 */
function checkFrequencyLimit({ minIntervalMs }) {
  const lastSent = readLastSentTime();

  if (lastSent === null) {
