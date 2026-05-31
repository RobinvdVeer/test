const { getPool } = require('../db/pool');
const { getConfig } = require('../config');
const { sendReminderEmail } = require('./email');

/**
 * Fetch all non-completed todos whose due_date falls within the configured
 * "due soon" window, grouped by user_id.
 *
 * @returns {Promise<Map<string, Array<object>>>}
 *   Map keyed by user_id → array of todo rows with title, category, due_date
 */
async function getDueSoonTodos() {
  const { reminder } = getConfig();
  const intervalParam = `${reminder.dueSoonHours} hours`;

  const result = await getPool().query(
    `SELECT user_id, title, category, due_date
     FROM todos
     WHERE due_date IS NOT NULL
       AND status != 'completed'
       AND due_date BETWEEN NOW() AND NOW() + INTERVAL $1`,
    [intervalParam]
  );

  const todosByUser = new Map();
  for (const row of result.rows) {
    const key = row.user_id;
    if (!todosByUser.has(key)) {
      todosByUser.set(key, []);
    }
    todosByUser.get(key).push(row);
  }

  return todosByUser;
}

/**
 * Check whether enough time has elapsed since the user's last reminder.
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true if we should send a reminder now
 */
async function shouldSendReminder(userId) {
  const { reminder } = getConfig();
  const intervalParam = `${reminder.minIntervalMinutes} minutes`;

  const result = await getPool().query(
    'SELECT last_reminder_sent FROM users WHERE user_id = $1',
    [userId]
  );

  const row = result.rows[0];

  // If the user has no last_reminder_sent yet, they are eligible.
  if (!row || !row.last_reminder_sent) {
    return true;
  }

  // Compare the last-sent timestamp to NOW() minus the minimum interval.
  const lastSent = new Date(row.last_reminder_sent);
  const nowMinusInterval = new Date(Date.now() - reminder.minIntervalMinutes * 60 * 1000);

  return lastSent < nowMinusInterval;
}

/**
 * Update a user's last_reminder_sent timestamp to NOW().
 *
 * @param {string} userId
 */
async function markReminderSent(userId) {
  await getPool().query(
    'UPDATE users SET last_reminder_sent = NOW() WHERE user_id = $1',
    [userId]
  );
}

/**
 * Main orchestration function:
 *   1. Fetch due-soon todos grouped by user.
 *   2. For each user with due-soon todos, check cooldown.
 *   3. Send reminder emails to eligible users.
 *   4. Update last_reminder_sent for every user we emailed.
 *
 * @returns {Promise<{usersNotified: number, totalTodos: number, errors: string[]}>}
 */
async function sendReminders() {
  const usersNotified = new Set();
  let totalTodos = 0;
  const errors = [];

  const todosByUser = await getDueSoonTodos();

  for (const [userId, todos] of todosByUser) {
    // Skip if the user doesn't have an email on record.
    const userResult = await getPool().query(
      'SELECT email FROM users WHERE user_id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user || !user.email) {
      continue;
    }

    // Respect the per-user cooldown.
    const eligible = await shouldSendReminder(userId);
    if (!eligible) {
      continue;
    }

    // Send the reminder email.
    const emailResult = await sendReminderEmail({ to: user.email, todos });

    if (emailResult.success) {
      await markReminderSent(userId);
      usersNotified.add(userId);
      totalTodos += todos.length;
    } else {
      errors.push(`Failed to send reminder to ${user.email}: ${emailResult.error || 'unknown error'}`);
    }
  }

  return {
    usersNotified: usersNotified.size,
    totalTodos,
    errors,
  };
}

module.exports = {
  getDueSoonTodos,
  shouldSendReminder,
  sendReminders,
};
