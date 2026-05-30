const { getPool } = require('../db/pool');
const { sendReminder } = require('./reminders');
const { updateUserEmailPreferences } = require('../repositories/usersRepository');

// Reminder window: how far ahead to look for upcoming due dates (2 days)
const REMINDER_WINDOW_DAYS = 2;

/**
 * Start the in-process email reminder scheduler.
 *
 * @param {import('express').Express} app - The Express app (reserved for future use).
 * @param {object} config - App config object.
 * @returns {{ stop: () => Promise<void> }} Handle with a stop method.
 */
async function startScheduler(app, config) {
  // Read the scheduler interval from environment, default to 1 hour.
  const intervalMs = Math.max(
    60_000,
    Number(process.env.SCHEDULER_INTERVAL_MS) || 60 * 60 * 1000
  );

  // Early exit if SMTP is not configured — no point running the scheduler.
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log('[scheduler] SMTP_HOST not configured; scheduler disabled.');
    return { stop: () => Promise.resolve() };
  }

  let stopped = false;

  async function tick() {
    if (stopped) return;

    console.log('[scheduler] Running reminder tick...');

    try {
      // 1. Query all users with email_enabled = true and a stored email address.
      const usersResult = await getPool().query(
        `SELECT user_id, email, email_frequency_hours, last_email_sent_at
         FROM users
         WHERE email_enabled = TRUE
           AND email IS NOT NULL`
      );

      if (usersResult.rows.length === 0) {
        console.log('[scheduler] No users with email reminders enabled.');
        return;
      }

      const now = new Date();
      const twoDaysFromNow = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      // 2. For each user, check if it's time to send a reminder.
      for (const user of usersResult.rows) {
        try {
          const frequencyHours = Number(user.email_frequency_hours) || 24;
          const lastSent = user.last_email_sent_at
            ? new Date(user.last_email_sent_at)
            : null;

          // If the user has never received a reminder, or the last one was
          // older than their configured frequency, send a reminder.
          if (lastSent && lastSent.getTime() + frequencyHours * 60 * 60 * 1000 > now.getTime()) {
            continue; // Not yet time for this user.
          }

          // 3. Query their pending/in-progress todos with due_date within 2 days.
          const todosResult = await getPool().query(
            `SELECT title, category, priority, due_date, status
             FROM todos
             WHERE user_id = $1
               AND status IN ('pending', 'in_progress')
               AND due_date IS NOT NULL
               AND due_date <= $2
             ORDER BY due_date ASC`,
            [user.user_id, twoDaysFromNow.toISOString()]
          );

          if (todosResult.rows.length === 0) {
            continue; // No upcoming todos to remind about.
          }

          // 4. Send a reminder email.
          const emailSent = await sendReminder(user.email, todosResult.rows);

          // 5. Update last_email_sent_at if the email was sent successfully.
          if (emailSent) {
            await updateUserEmailPreferences(user.user_id, {
              last_email_sent_at: now.toISOString(),
            });
            console.log(`[scheduler] Reminder sent to ${user.email} for ${todosResult.rows.length} upcoming todo(s).`);
          }
        } catch (userError) {
          console.error(`[scheduler] Error processing user ${user.user_id}:`, userError.message);
        }
      }
    } catch (tickError) {
      console.error('[scheduler] Error during reminder tick:', tickError.message);
    }
  }

  // Run the first tick immediately, then on the configured interval.
  await tick();

  const intervalId = setInterval(tick, intervalMs);

  return {
    stop: async () => {
      stopped = true;
      clearInterval(intervalId);
      console.log('[scheduler] Scheduler stopped.');
    },
  };
}

module.exports = { startScheduler };
