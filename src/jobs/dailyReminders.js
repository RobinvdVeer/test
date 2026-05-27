function parseRunAtUtc(runAtUtc) {
  const [hourPart, minutePart] = String(runAtUtc || '08:00').split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { hour: 8, minute: 0 };
  }

  return { hour, minute };
}

function addDaysUtc(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyUtc(date) {
  return date.toISOString().slice(0, 10);
}

function getNextRunDelayMs(now, runAtUtc) {
  const { hour, minute } = parseRunAtUtc(runAtUtc);
  const nextRun = new Date(now.getTime());
  nextRun.setUTCHours(hour, minute, 0, 0);
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
}

function groupTodosByUser(rows) {
  const recipients = new Map();

  for (const row of rows) {
    if (!row.email || !row.user_id) continue;

    if (!recipients.has(row.user_id)) {
      recipients.set(row.user_id, {
        email: row.email,
        todos: [],
      });
    }

    recipients.get(row.user_id).todos.push(row);
  }

  return recipients;
}

function buildReminderText({ appBaseUrl, recipientEmail, todos, startDate, endDate }) {
  const lines = [
    `Hi ${recipientEmail},`,
    '',
    `Here are your todos due between ${startDate} and ${endDate}:`,
    '',
  ];

  for (const todo of todos) {
    const dueDate = String(todo.due_date).slice(0, 10);
    lines.push(`- [${dueDate}] ${todo.title}`);
  }

  lines.push('', `Open the app: ${appBaseUrl}`, '');
  return lines.join('\n');
}

function buildReminderSubject(startDate, endDate) {
  if (startDate === endDate) {
    return `Todo reminders for ${startDate}`;
  }

  return `Todo reminders for ${startDate} to ${endDate}`;
}

async function sendReminderEmail({ fetchImpl, sendUrl, apiKey, from, to, subject, text }) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchImpl(sendUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send reminder email: ${response.status}`);
  }
}

async function runDailyReminderBatch({ pool, config, fetchImpl = fetch, now = () => new Date(), logger = console }) {
  if (!config?.enabled) {
    return { sent: 0, skipped: true };
  }

  const start = now();
  const end = addDaysUtc(start, config.lookaheadDays || 0);
  const startDate = toDateOnlyUtc(start);
  const endDate = toDateOnlyUtc(end);

  const queryResult = await pool.query(
    `SELECT u.email, u.user_id, t.id, t.title, t.due_date, t.status, t.priority
FROM todos t
JOIN users u ON u.user_id = t.user_id
WHERE u.email IS NOT NULL
  AND t.due_date IS NOT NULL
  AND t.status <> 'completed'
  AND t.due_date BETWEEN $1::date AND $2::date
ORDER BY u.email ASC, t.due_date ASC, t.id ASC`,
    [startDate, endDate]
  );

  const recipients = groupTodosByUser(queryResult.rows || []);
  let sent = 0;

  for (const [userId, recipient] of recipients.entries()) {
    const subject = buildReminderSubject(startDate, endDate);
    const text = buildReminderText({
      appBaseUrl: config.appBaseUrl,
      recipientEmail: recipient.email,
      todos: recipient.todos,
      startDate,
      endDate,
    });

    try {
      await sendReminderEmail({
        fetchImpl,
        sendUrl: config.sendUrl,
        apiKey: config.apiKey,
        from: config.from,
        to: recipient.email,
        subject,
        text,
      });
      sent += 1;
    } catch (error) {
      logger.error('Error sending reminder email:', { userId, error });
    }
  }

  return { sent, skipped: false, recipients: recipients.size };
}

function startDailyReminderScheduler({ pool, config, fetchImpl = fetch, logger = console, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout }) {
  if (!config?.enabled) {
    return { stop() {} };
  }

  let stopped = false;
  let timer = null;

  const scheduleNext = () => {
    if (stopped) return;
    const delayMs = getNextRunDelayMs(new Date(), config.runAtUtc);
    timer = setTimeoutImpl(async () => {
      try {
        await runDailyReminderBatch({ pool, config, fetchImpl, logger });
      } catch (error) {
        logger.error('Error running daily reminder batch:', error);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeoutImpl(timer);
      }
    },
  };
}

module.exports = {
  addDaysUtc,
  buildReminderSubject,
  buildReminderText,
  getNextRunDelayMs,
  runDailyReminderBatch,
  startDailyReminderScheduler,
};
