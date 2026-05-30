const { getPool, closePool } = require('./src/db/pool');
const { processReminders, getReminderInterval } = require('./src/email/reminders');

let reminderInterval;

async function startReminderRunner() {
  const pool = getPool();

  console.log('[Reminder Runner] Starting email reminder service...');
  console.log(`[Reminder Runner] Checking todos due within ${2} days...`);

  // Process initially (for immediate reminder if it's due)
  await processReminders();

  // Set up interval for recurring checks
  const intervalMs = getReminderInterval();
  console.log(`[Reminder Runner] Starting periodic checks every ${intervalMs / (60 * 1000)} minutes...`);

  reminderInterval = setInterval(async () => {
    try {
      await processReminders();
    } catch (error) {
      console.error('[Reminder Runner] Error during reminder check:', error);
    }
  }, intervalMs);

  // Handle shutdown
  const shutdown = async () => {
    console.log('[Reminder Runner] Shutting down...');
    clearInterval(reminderInterval);
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return shutdown;
}

// Start the reminder runner
const shutdownPromise = startReminderRunner();

// Exit handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
