const nodemailer = require('nodemailer');

function buildTransport(config) {
  if (!config.smtpHost) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth:
      config.smtpUser && config.smtpPass
        ? {
            user: config.smtpUser,
            pass: config.smtpPass,
          }
        : undefined,
  });
}

function buildEmailBody(todos, dueSoonThresholdDays) {
  const lines = [
    '<h2>Upcoming Todo Reminders</h2>',
    `<p>You have <strong>${todos.length}</strong> todo(s) with a due date within ${dueSoonThresholdDays} day(s):</p>`,
    '<ul>',
  ];

  todos.forEach((todo) => {
    const dueDateStr = todo.due_date
      ? new Date(todo.due_date).toLocaleDateString()
      : 'No due date';

    lines.push('<li>');
    lines.push(`<strong>${escapeHtml(todo.title)}</strong>`);
    if (todo.description) {
      lines.push(`<br/>${escapeHtml(todo.description)}`);
    }
    lines.push(`<br/><em>Due: ${dueDateStr}</em>`);
    lines.push('</li>');
  });

  lines.push('</ul>');
  lines.push('<p>Please review and complete these items as soon as possible.</p>');

  return lines.join('\n');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendTodoReminder({ to, todos, dueSoonThresholdDays }) {
  if (!to || todos.length === 0) {
    return false;
  }

  const config = {
    smtpHost: process.env.SMTP_HOST || null,
    smtpPort: process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || null,
    smtpPass: process.env.SMTP_PASS || null,
    smtpFrom: process.env.SMTP_FROM || 'noreply@localhost',
  };

  const transport = buildTransport(config);
  if (!transport) {
    console.warn(
      '[email] SMTP_HOST not configured — skipping email send for',
      to
    );
    return false;
  }

  const html = buildEmailBody(todos, dueSoonThresholdDays);

  const mailOptions = {
    from: `"Todo App" <${config.smtpFrom}>`,
    to,
    subject: 'Todo Reminder: Upcoming Due Dates',
    html,
  };

  try {
    await transport.sendMail(mailOptions);
    console.log('[email] Reminder sent to', to);
    return true;
  } catch (error) {
    console.error('[email] Failed to send reminder to', to, error);
    return false;
  }
}

module.exports = { sendTodoReminder };
