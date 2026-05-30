const nodemailer = require('nodemailer');

/**
 * Configure and return a nodemailer transporter from environment variables.
 * Reads SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS from the env object
 * (defaults to process.env).
 *
 * @param {object} env - Environment variables object.
 * @returns {import('nodemailer').Transporter|null} Transporter instance, or null if required SMTP settings are missing.
 */
function configureSMTP(env = process.env) {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined;

  if (!host) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: env.SMTP_USER || env.SMTP_PASS
      ? {
          user: env.SMTP_USER || '',
          pass: env.SMTP_PASS || '',
        }
      : undefined,
  });
}

/**
 * Build a reminder email object for the given list of todos.
 *
 * @param {string} to - Recipient email address.
 * @param {Array<{title: string, category?: string, priority?: string, due_date?: string}>} todos - Array of upcoming todo objects.
 * @returns {{to: string, from: string, subject: string, text: string, html: string}}
 */
function buildReminderEmail(to, todos) {
  const emailFrom = process.env.SMTP_FROM || 'notifications@todos.app';

  const textLines = ['Your upcoming todos:', ''];
  const htmlRows = [];

  todos.forEach((todo) => {
    textLines.push(`- ${todo.title}`);
    if (todo.category) textLines.push(`  Category: ${todo.category}`);
    if (todo.priority) textLines.push(`  Priority: ${todo.priority}`);
    if (todo.due_date) textLines.push(`  Due: ${todo.due_date}`);
    if (todo.status) textLines.push(`  Status: ${todo.status}`);
    textLines.push('');

    htmlRows.push(`<li><strong>${escapeHtml(todo.title)}</strong>`);
    if (todo.category) htmlRows.push(`<br>Category: ${escapeHtml(todo.category)}`);
    if (todo.priority) htmlRows.push(`<br>Priority: ${escapeHtml(todo.priority)}`);
    if (todo.due_date) htmlRows.push(`<br>Due: ${escapeHtml(todo.due_date)}`);
    if (todo.status) htmlRows.push(`<br>Status: ${escapeHtml(todo.status)}`);
    htmlRows.push('</li>');
  });

  const text = textLines.join('\n');

  const html = `
    <h2>Your upcoming todos</h2>
    <ul>
      ${htmlRows.join('\n      ')}
    </ul>
    <p style="color: #666; font-size: 0.85em;">This is an automated reminder. Please review and update your tasks.</p>
  `;

  return {
    to,
    from: emailFrom,
    subject: `You have ${todos.length} upcoming todo${todos.length !== 1 ? 's' : ''}`,
    text,
    html,
  };
}

/**
 * Send a reminder email to the given recipient with the provided todos.
 *
 * @param {string} to - Recipient email address.
 * @param {Array<{title: string, category?: string, priority?: string, due_date?: string, status?: string}>} todos - Array of upcoming todo objects.
 * @returns {Promise<boolean>} True if the email was sent successfully, false otherwise.
 */
async function sendReminder(to, todos) {
  if (!to || !todos || todos.length === 0) {
    return false;
  }

  const transporter = configureSMTP();
  if (!transporter) {
    console.error('[reminder] SMTP configuration missing; cannot send email.');
    return false;
  }

  try {
    const mailOptions = buildReminderEmail(to, todos);
    await transporter.sendMail(mailOptions);
    console.log(`[reminder] Sent email to ${mailOptions.to} with ${todos.length} upcoming todos`);
    return true;
  } catch (error) {
    console.error('[reminder] Failed to send reminder email:', error.message);
    return false;
  }
}

/**
 * Escape HTML entities in a string to prevent XSS in email templates.
 *
 * @param {string} str - String to escape.
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { configureSMTP, buildReminderEmail, sendReminder };
