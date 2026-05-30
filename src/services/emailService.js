const nodemailer = require('nodemailer');

function createTransporter(config) {
  if (!config.host || !config.user || !config.password) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: config.tlsRejectUnauthorized !== false,
    },
  });
}

function formatEmailBody(todoList, userName) {
  const greeting = userName ? `Hello ${userName},` : 'Hello,';

  const items = todoList
    .map(
      (todo) => `
  - [ ] ${todo.title}${todo.description ? '\n    ' + todo.description : ''}${
        todo.category ? ` (category: ${todo.category})` : ''
      }${todo.priority ? ` | priority: ${todo.priority}` : ''}`
    )
    .join('\n');

  return `${greeting}

You have ${todoList.length} upcoming task${todoList.length === 1 ? '' : 's'} with a due date within the next 2 days:

${items}

Please review and complete them before their due dates.

Best regards,
Metrics Todo App`;
}

/**
 * @param {object} config - Email configuration (host, port, user, password, from, secure)
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(config, to, subject, html) {
  if (!config.host || !config.user || !config.password) {
    return { success: false, error: 'Email not configured' };
  }

  const transporter = createTransporter(config);
  if (!transporter) {
    return { success: false, error: 'Failed to create email transporter' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Metrics Todo App" <${config.from || config.user}>`,
      to,
      subject,
      html: `<pre style="font-family: sans-serif; white-space: pre-wrap;">${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { createTransporter, formatEmailBody, sendEmail };
