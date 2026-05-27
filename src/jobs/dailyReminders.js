const { getReminderWindow, groupReminderCandidatesByEmail, selectReminderCandidates } = require('./reminderCandidates');
const { buildReminderSubject, buildReminderText } = require('./reminderContent');
const { sendReminderEmail } = require('./reminderEmailClient');

function parseRunAtUtc(runAtUtc) {
  const [hourPart, minutePart] = String(runAtUtc || '08:00').split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { hour: 8, minute: 0 };
  }

  return { hour, minute };
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

async function runDailyReminderBatch({ pool, config, fetchImpl = fetch, now = () => new Date(), logger = console }) {
  if (!config?.enabled) {
    return { sent: 0, skipped: true };
  }

  const window = getReminderWindow(now(), config.lookaheadDays || 0);
  const rows = await selectReminderCandidates(pool, window.startDate, window.endDate);
  const recipients = groupReminderCandidatesByEmail(rows);
  let sent = 0;

  for (const [email, todos] of recipients.entries()) {
    const subject = buildReminderSubject(window.startDate, window.endDate);
    const text = buildReminderText({
      appBaseUrl: config.appBaseUrl,
      recipientEmail: email,
      todos,
      startDate: window.startDate,
      endDate: window.endDate,
    });

    try {
      await sendReminderEmail({
        fetchImpl,
        sendUrl: config.sendUrl,
        apiKey: config.apiKey,
        from: config.from,
        to: email,
        subject,
        text,
      });
      sent += 1;
    } catch (error) {
      logger.error('Error sending reminder email:', { email, error });
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
  getNextRunDelayMs,
  runDailyReminderBatch,
  startDailyReminderScheduler,
};
