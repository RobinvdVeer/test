const { getPool } = require('../db/pool');
const todoRepository = require('../repositories/todosRepository');
const preferencesRepository = require('../repositories/email-preferences');
const { createTransporter } = require('./config');
const { generateReminderEmail } = require('./reminder-template');

// Constants
const MAX_REMINDER_DUE_DAYS = 2;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

async function getTodosDueWithinWindow() {
  // Query todos that are:
  // - Due within 2 days (or already due)
  // - Not completed
  // - Have valid due dates
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + TWO_DAYS_MS);

  const query = `
    SELECT
      t.*,
      u.email
    FROM todos t
    JOIN users u ON t.user_id = u.user_id
    WHERE t.due_date IS NOT NULL
      AND t.status != 'completed'
      AND t.due_date <= $1
      AND t.due_date >= NOW() - INTERVAL '1 day'
    ORDER BY t.due_date ASC, t.priority DESC
  `;

  const result = await getPool().query(query, [twoDaysFromNow]);
  return result.rows;
}

async function processReminders() {
  console.log('[Email Reminders] Starting to process due todos...');

  const todos = await getTodosDueWithinWindow();
  console.log(`[Email Reminders] Found ${todos.length} todos due within reminder window`);

  let sentCount = 0;
  let failedCount = 0;

  for (const todo of todos) {
    try {
      await sendReminderForTodo(todo);
      sentCount++;
    } catch (error) {
      console.error(`[Email Reminders] Failed to send reminder for todo ${todo.id}:`, error.message);
      failedCount++;
    }
  }

  console.log(
    `[Email Reminders] Reminder processing complete: ${sentCount} sent, ${failedCount} failed`
  );
  return { sentCount, failedCount };
}

async function sendReminderForTodo(todo) {
  const preferences = await preferencesRepository.getPreferences(todo.user_id);

  if (!preferences || !preferences.notify_daily) {
    console.log(
      `[Email Reminders] Skipping reminder for todo ${todo.id}: user has notifications disabled`
    );
    return;
  }

  // Get SMTP config from preferences
  let transporter;
  let smtpConfig = preferences.smtp_config;

  if (!smtpConfig) {
    console.log('[Email Reminders] Skipping: No SMTP config found');
    return;
  }

  transporter = createTransporter(smtpConfig);
  if (!transporter) {
    console.log('[Email Reminders] Skipping: Invalid SMTP config');
    return;
  }

  const email = generateReminderEmail(todo, preferences);

  try {
    await transporter.sendMail(email);
    console.log(
      `[Email Reminders] Successfully sent reminder to ${todo.email} for todo "${todo.title}" (ID: ${todo.id})`
    );
  } catch (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// Run reminders on a 1-hour interval by default
// This can be configured via environment variable
function getReminderInterval() {
  const interval = process.env.REMINDER_INTERVAL_MS;
  return interval ? parseInt(interval, 10) : 60 * 60 * 1000; // Default: 1 hour
}

module.exports = {
  getTodosDueWithinWindow,
  processReminders,
  sendReminderForTodo,
  getReminderInterval,
};
