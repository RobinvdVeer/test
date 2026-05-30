const nodemailer = require('nodemailer');

/**
 * Creates a nodemailer transporter from the SMTP configuration.
 * Returns null if no SMTP is configured (no host).
 */
function createTransporter({ host, port, secure, user, password, from }) {
  if (!host) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: port || (secure ? 465 : 587),
    secure: secure || false,
    auth: user
      ? { user, pass: password || '' }
      : undefined,
    tls: {
      rejectUnauthorized: false, // Allow self-signed certs in dev
    },
  });

  return transporter;
}

/**
 * Builds the "from" address.
 * If a full email is provided, use it directly; otherwise derive from SMTP user.
 */
function buildFrom(fromOverride, smtpUser) {
  if (fromOverride && fromOverride.includes('@')) {
    return fromOverride;
  }
  if (smtpUser && smtpUser.includes('@')) {
    return smtpUser;
  }
  return 'todos@localhost';
}

/**
 * Formats a plain-text reminder message for a single user.
 */
function formatReminder({ userName, email, todos }) {
  const subject = `You have ${todos.length} pending todo${todos.length !== 1 ? 's' : ''} due soon`;

  const lines = [
    'Hi,',
    '',
    'Here are your pending todos with a due date less than 2 days away:',
    '',
  ];

  todos.forEach((todo) => {
    const dueDate = todo.due_date ? new Date(todo.due_date).toLocaleDateString() : 'No due date';
    lines.push(`- ${todo.title} (due: ${dueDate})`);
  });

  lines.push('');
  lines.push('Please check your todo list for details.');
  lines.push('');
  lines.push('— Todo App');

  return { subject, text: lines.join('\n') };
}

/**
 * Sends an email using the configured SMTP transport.
 * Returns { sent: true, message: '...' } on success
 * or { sent: false, error: '...' } on failure.
 */
async function sendEmail({ host, port, secure, user, password, from, to, subject, text }) {
  const transporter = createTransporter({ host, port, secure, user, password, from });

  if (!transporter) {
    return {
      sent: false,
      error: 'SMTP not configured. Set NOTIFICATION_SMTP_HOST to enable email delivery.',
    };
  }

  const fromAddress = buildFrom(from, user);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: `Failed to send email: ${error.message}`,
    };
  }
}

module.exports = {
  createTransporter,
  sendEmail,
  formatReminder,
  buildFrom,
};
