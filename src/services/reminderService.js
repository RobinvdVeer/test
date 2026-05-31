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
 * Server-side SQL comparison to stay consistent with the rest of the codebase.
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true if we should send a reminder now
 */
async function shouldSendReminder(userId) {
  const { reminder } = getConfig();
  const intervalParam = `${reminder.minIntervalMinutes} minutes`;

  const result = await getPool().query(
    'SELECT 1 FROM users WHERE user_id = $1 AND (last_reminder_sent IS NULL OR last_reminder_sent < NOW() - INTERVAL $2)',
    [userId, intervalParam]
  );

  return result.rows.length > 0;
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
    // Single query for both email and cooldown check.
    const { reminder } = getConfig();
    const intervalParam = `${reminder.minIntervalMinutes} minutes`;

    const userResult = await getPool().query(
      'SELECT email FROM users WHERE user_id = $1 AND (last_reminder_sent IS NULL OR last_reminder_sent < NOW() - INTERVAL $2)',
      [userId, intervalParam]
    );

    const user = userResult.rows[0];
    if (!user || !user.email) {
      continue;
    }

    // Send the reminder email.
    const emailResult = await sendReminderEmail({ to: user.email, todos, dueSoonHours: reminder.dueSoonHours });

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

let reminderIntervalId = null;

/**
 * Start the reminder scheduler:
 *   - Logs a warning if email is not configured (default localhost)
 *   - Calls sendReminders() immediately on startup
 *   - Sets up a recurring setInterval based on REMINDER_CHECK_INTERVAL_MINUTES
 *   - Returns the interval ID so it can be cleared on shutdown
 *
 * @returns {NodeJS.Timeout|null} interval ID, or null if email is disabled
 */
function startReminderScheduler() {
  const { reminder, email } = getConfig();

  // If the SMTP host is still the default (localhost), warn but don't block startup.
  if (email.host === 'localhost' && !process.env.EMAIL_HOST) {
    console.warn(
      'Reminder scheduler started but EMAIL_HOST is the default (localhost). '
      + 'Set a real SMTP host to actually send emails.'
    );
  }

  // Run immediately so reminders catch up on first boot.
  sendReminders()
    .then((summary) => {
      console.log(
        `Reminder scheduler initial run: ${summary.usersNotified} users notified, `
        + `${summary.totalTodos} todos, ${summary.errors.length} errors`
      );
    })
    .catch((err) => {
      console.error('Reminder scheduler initial run failed:', err.message);
    });

  const intervalMs = reminder.checkIntervalMinutes * 60 * 1000;
  reminderIntervalId = setInterval(() => {
    console.log('Reminder scheduler running...');
    sendReminders()
      .then((summary) => {
        console.log(
          `Reminder scheduler run: ${summary.usersNotified} users notified, `
          + `${summary.totalTodos} todos, ${summary.errors.length} errors`
        );
      })
      .catch((err) => {
        console.error('Reminder scheduler run failed:', err.message);
      });
  }, intervalMs);

  console.log(
    `Reminder scheduler started (every ${reminder.checkIntervalMinutes} min)`
  );

  return reminderIntervalId;
}

/**
 * Stop the reminder scheduler, clearing the interval.
 */
function stopReminderScheduler() {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    console.log('Reminder scheduler stopped');
  }
}

module.exports = {
  getDueSoonTodos,
  shouldSendReminder,
  sendReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
