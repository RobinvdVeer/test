const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

/**
 * Create a nodemailer transporter from the configured SMTP settings.
 * Returns null if no email configuration is available.
 */
function createTransporter() {
  const config = getConfig();
  const emailConfig = config.email;

  if (!emailConfig || !emailConfig.host || !emailConfig.sender) {
    console.log('Email not configured (SMTP_HOST and SMTP_SENDER required)');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port || 587,
    secure: emailConfig.secure || false,
  });

  return transporter;
}

/**
 * Format the todo list into a plain-text email body.
 */
function formatEmailBody(todoList) {
  const lines = [
    'Hi,',
    '',
    'You have the following upcoming todo deadlines:',
    '',
  ];

  todoList.forEach((todo, index) => {
    const dueDate = todo.due_date
      ? new Date(todo.due_date).toLocaleDateString()
      : 'No due date set';
    const title = todo.title;
    const description = todo.description ? todo.description : 'No description';

    lines.push(`${index + 1}. ${title}`);
    lines.push(`   ${description}`);
    lines.push(`   Due: ${dueDate}`);

    if (todo.status && todo.status !== 'pending') {
      lines.push(`   Status: ${todo.status}`);
    }

    lines.push('');
  });

  lines.push('—');
  lines.push('Your Todo App');

  return lines.join('\n');
}

/**
 * Send a reminder email to the specified user about their upcoming todo deadlines.
 *
 * @param {string} userEmail - The recipient's email address
 * @param {Array}  todoList  - Array of todo objects with at least {id, title, description, due_date}
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendTodoReminders(userEmail, todoList) {
  if (!userEmail || typeof userEmail !== 'string') {
    return { success: false, error: 'Invalid recipient email' };
  }

  if (!todoList || !Array.isArray(todoList) || todoList.length === 0) {
    return { success: false, error: 'No todos to send' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, error: 'Email not configured' };
  }

  const subject = 'Upcoming Todo Deadlines';
  const body = formatEmailBody(todoList);

  try {
    const config = getConfig();
    const info = await transporter.sendMail({
      from: `"Todo App" <${config.email.sender}>`,
      to: userEmail,
      subject,
      text: body,
    });

    console.log('[email-reminder] Sent to %s: %s', userEmail, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[email-reminder] Failed to send email to %s: %s', userEmail, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createTransporter,
  formatEmailBody,
  sendTodoReminders,
};
