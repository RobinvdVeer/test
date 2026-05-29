const { sendEmail } = require('./smtpClient');

function formatDueDate(value) {
  return new Date(value).toUTCString();
}

function createTodoReminderService({ pool, config, mailer = sendEmail, logger = console }) {
  const dueSoonHours = config.dueSoonHours ?? 24;
  const intervalMs = config.intervalMs ?? 3_600_000;
  const enabled = Boolean(config.enabled);

  let timer = null;
  let running = false;

  async function runOnce() {
    if (!enabled) {
      return { enabled: false, scanned: 0, sent: 0 };
    }

    if (running) {
      return { enabled: true, skipped: true, scanned: 0, sent: 0 };
    }

    running = true;
    try {
      const result = await pool.query(
        `SELECT t.id, t.title, t.due_at, u.email
         FROM todos t
         JOIN users u ON u.user_id = t.user_id
         WHERE t.status = 'pending'
           AND t.due_at IS NOT NULL
           AND t.due_at > NOW()
           AND t.due_at <= NOW() + ($1 * interval '1 hour')
           AND t.reminder_sent_at IS NULL
           AND u.email IS NOT NULL
         ORDER BY t.due_at ASC
         LIMIT 100`,
        [dueSoonHours]
      );

      let sent = 0;
      for (const todo of result.rows) {
        const subject = `Todo due soon: ${todo.title}`;
        const text = [
          `Your todo "${todo.title}" is due soon.`,
          `Due date: ${formatDueDate(todo.due_at)}`,
          '',
          'Open the app to review or update it.',
        ].join('\n');

        try {
          await mailer({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            username: config.smtp.user,
            password: config.smtp.password,
            from: config.smtp.from,
            to: todo.email,
            subject,
            text,
          });

          await pool.query('UPDATE todos SET reminder_sent_at = NOW() WHERE id = $1 AND reminder_sent_at IS NULL', [
            todo.id,
          ]);
          sent += 1;
        } catch (error) {
          logger.error('Failed to send todo reminder email:', error);
        }
      }

      return { enabled: true, scanned: result.rows.length, sent };
    } finally {
      running = false;
    }
  }

  function start() {
    if (!enabled || timer) return stop;

    runOnce().catch((error) => logger.error('Todo reminder run failed:', error));
    timer = setInterval(() => {
      runOnce().catch((error) => logger.error('Todo reminder run failed:', error));
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return stop;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { runOnce, start, stop };
}

module.exports = { createTodoReminderService };
