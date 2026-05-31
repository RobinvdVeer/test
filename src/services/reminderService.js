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
 * Check whether enough time has elapsed since the user's last reminder,
 * using a cached last_reminder_sent value (batched from sendReminders).
 *
 * @param {string}  userId
 * @param {string}  lastReminderSent  – last_reminder_sent string from batch query
 * @returns {boolean} true if we should send a reminder now
 */
function shouldSendReminderFromCache(userId, lastReminderSent) {
  if (!lastReminderSent) {
    return true;
  }

  const { reminder } = getConfig();
  const lastSent = new Date(lastReminderSent);
  const nowMinusInterval = new Date(Date.now() - reminder.minIntervalMinutes * 60 * 1000);

  return lastSent < nowMinusInterval;
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
  if (isRunning) {
    console.log('Reminder scheduler: previous run still in progress, skipping');
    return { usersNotified: 0, totalTodos: 0, errors: ['Previous run still in progress'] };
  }

  isRunning = true;

  try {
    const usersNotified = new Set();
    let totalTodos = 0;
    const errors = [];

    const todosByUser = await getDueSoonTodos();

    if (todosByUser.size === 0) {
      return { usersNotified: 0, totalTodos: 0, errors: [] };
    }

    // Batch-fetch emails and last_reminder_sent for all users in a single query.
    const userIds = Array.from(todosByUser.keys());
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
    const userResult = await getPool().query(
      `SELECT user_id, email, last_reminder_sent FROM users WHERE user_id IN (${placeholders})`,
      userIds
    );

    const userMap = new Map();
    for (const row of userResult.rows) {
      userMap.set(row.user_id, row);
    }

    // Determine eligibility using the batched last_reminder_sent data.
    for (const [userId, todos] of todosByUser) {
      const user = userMap.get(userId);
      if (!user || !user.email) {
        continue;
      }

      // Respect the per-user cooldown using the batched data.
      const eligible = shouldSendReminderFromCache(userId, user.last_reminder_sent);
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
  } finally {
    isRunning = false;
  }
}

let reminderIntervalId = null;
let isRunning = false;

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
