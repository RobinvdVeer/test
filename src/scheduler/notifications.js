const { getConfig } = require('../config');
const { getUpcomingTodos, markAsEmailed } = require('../repositories/notificationsRepository');
const { sendEmail, formatEmailBody } = require('../services/emailService');

let running = false;
let intervalId = null;

/**
 * Run one cycle of the notification scheduler:
 *  1. Find todos with due dates within lookAheadDays
 *  2. Send emails to users who haven't been emailed recently
 *  3. Mark those todos as emailed
 */
async function runNotificationCycle() {
  if (running) {
    console.log('[scheduler] Notification cycle already running, skipping');
    return;
  }

  running = true;
  const config = getConfig();
  const emailConfig = config.email || {};
  const notificationConfig = config.notifications || {};

  const enabled = notificationConfig.enabled;
  const lookAheadDays = notificationConfig.lookAheadDays || 2;
  const minDaysSinceLastEmail = notificationConfig.minDaysSinceLastEmail || 0;

  if (!enabled) {
    running = false;
    return;
  }

  if (!emailConfig.host || !emailConfig.user || !emailConfig.password) {
    console.log('[scheduler] Email not configured; skipping notification cycle');
    running = false;
    return;
  }

  try {
    console.log(
      `[scheduler] Starting notification cycle (lookAheadDays=${lookAheadDays}, minDaysSinceLastEmail=${minDaysSinceLastEmail}d)`
    );

    const todos = await getUpcomingTodos({
      lookAheadDays,
      minDaysSinceLastEmail,
    });

    if (todos.length === 0) {
      console.log('[scheduler] No upcoming todos to notify about');
      running = false;
      return;
    }

    // Group todos by user_id
    const todosByUser = new Map();
    for (const todo of todos) {
      if (!todosByUser.has(todo.user_id)) {
        todosByUser.set(todo.user_id, []);
      }
      todosByUser.get(todo.user_id).push({
        user_id: todo.user_id,
        id: todo.id,
        title: todo.title,
        description: todo.description,
        category: todo.category,
        priority: todo.priority,
        due_date: todo.due_date,
        last_email_sent_at: todo.last_email_sent_at,
      });
    }

    // Send one email per user
    let sentCount = 0;
    let failedCount = 0;
    const allMarked = [];

    for (const [userId, userTodos] of todosByUser) {
      const subject = `⏰ You have ${userTodos.length} upcoming task${userTodos.length === 1 ? '' : 's'}`;
      const html = formatEmailBody(
        userTodos.map((t) => ({
          title: t.title,
          description: t.description,
          category: t.category,
          priority: t.priority,
        })),
        userId
      );

      // We need the user's email — for now use userId as the email address
      // In production this would come from Keycloak user profile
      const emailResult = await sendEmail(emailConfig, userId, subject, html);

      if (emailResult.success) {
        sentCount++;
        userTodos.forEach((t) => allMarked.push({ user_id: userId, id: t.id }));
      } else {
        failedCount++;
        console.error(`[scheduler] Failed to email user ${userId}: ${emailResult.error}`);
      }
    }

    // Mark all successfully emailed todos in the database
    if (allMarked.length > 0) {
      await markAsEmailed(allMarked);
    }

    console.log(
      `[scheduler] Notification cycle complete: ${sentCount} sent, ${failedCount} failed`
    );
  } catch (error) {
    console.error('[scheduler] Error during notification cycle:', error.message, error.stack);
  } finally {
    running = false;
  }
}

/**
 * Start the scheduler with the configured interval (in milliseconds).
 * Falls back to every 6 hours if no interval is configured or interval is 0.
 */
function startScheduler() {
  const config = getConfig();
  const notificationConfig = config.notifications || {};

  const enabled = notificationConfig.enabled;
  const intervalMs = notificationConfig.intervalMs || 0;

  if (!enabled) {
    console.log('[scheduler] Notifications are disabled');
    return;
  }

  const actualInterval = intervalMs || 6 * 60 * 60 * 1000; // Default: 6 hours
  console.log(`[scheduler] Starting with interval ${actualInterval}ms (${actualInterval / 3600000}h)`);

  // Run once immediately, then at intervals
  runNotificationCycle();
  intervalId = setInterval(() => {
    runNotificationCycle();
  }, actualInterval);

  // Make the scheduler stoppable (e.g., on SIGTERM)
  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log('[scheduler] Scheduler stopped');
    }
  };

  return stop;
}

/**
 * Stop the scheduler (called on SIGTERM).
 */
function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[scheduler] Scheduler stopped');
  }
  running = false;
}

module.exports = { runNotificationCycle, startScheduler, stopScheduler };
