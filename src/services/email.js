const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

function createTransporter() {
  const config = getConfig();
  const { email } = config;

  const transporter = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    auth:
      email.user && email.pass
        ? {
            user: email.user,
            pass: email.pass,
          }
        : undefined,
  });

  return transporter;
}

/**
 * Send an email.
 * @param {object} opts
 * @param {string} opts.to          – recipient address
 * @param {string} opts.subject    – email subject
 * @param {string} [opts.text]     – plain-text body
 * @param {string} [opts.html]     – HTML body
 * @returns {Promise<{success: boolean, info?: object, error?: string}>}
 */
async function sendEmail({ to, subject, text, html }) {
  const transporter = createTransporter();

  try {
    const info = await transporter.sendMail({
      from: `"Todo App" <${getConfig().email.from}>`,
      to,
      subject,
      text,
      html,
    });

    return { success: true, info };
  } catch (err) {
    console.error('Error sending email:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a reminder email listing upcoming todos.
 * @param {object} opts
 * @param {string} opts.to       – recipient address
 * @param {Array}  opts.todos    – array of todo objects (each with title, category, due_date)
 * @returns {Promise<{success: boolean, info?: object, error?: string}>}
 */
async function sendReminderEmail({ to, todos }) {
  const subject = 'Upcoming Todos – Action Required';

  const lines = todos.map((t) => {
    const date = t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No due date';
    const category = t.category ? ` [${t.category}]` : '';
    return `• ${t.title}${category} — Due: ${date}`;
  });

  const text = [
    'Hi,',
    '',
    'The following todos have a due date within the next 48 hours:',
    '',
    lines.join('\n'),
    '',
    'Please review and complete them before the deadline.',
    '',
    '— Todo App',
  ].join('\n');

  const html = [
    '<h2>Upcoming Todos</h2>',
    '<p>The following todos have a due date within the next 48 hours:</p>',
    '<ul>',
    ...todos.map((t) => {
      const date = t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No due date';
      const category = t.category ? ` <em>[${t.category}]</em>` : '';
      return `<li><strong>${t.title}</strong>${category} — Due: ${date}</li>`;
    }),
    '</ul>',
    '<p>Please review and complete them before the deadline.</p>',
    '<p>— Todo App</p>',
  ].join('\n');

  return sendEmail({ to, subject, text, html });
}

module.exports = {
  sendEmail,
  sendReminderEmail,
};
