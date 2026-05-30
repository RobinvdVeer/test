const nodemailer = require('nodemailer');
const { getPool } = require('../db/pool');

// Configuration for scheduled task
const TODO_DUE_SOON_DAYS = 2;
const DEFAULT_MAX_FREQUENCY_MILLIS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create transporter for sending emails
 */
function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.secure || false,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    tls: {
      rejectUnauthorized: config.rejectUnauthorized !== false,
    },
  });
}

/**
 * Get due todos for a user (due_date < 2 days from now)
 */
async function getDueTodos(userId) {
  const now = new Date();
  const dueDateThreshold = new Date(now.getTime() + TODO_DUE_SOON_DAYS * 24 * 60 * 60 * 1000);

  const query = `
    SELECT id, user_id, title, description, category, status, priority, due_date
    FROM todos
    WHERE user_id = $1 AND due_date IS NOT NULL AND due_date <= $2 AND status != 'completed'
    ORDER BY due_date ASC
  `;

  const result = await getPool().query(query, [userId, dueDateThreshold]);
  return result.rows;
}

/**
 * Get last email timestamp for a user
 */
async function getLastEmailSent(userId) {
  const query = `
    SELECT last_email_sent
    FROM email_reminder_status
    WHERE user_id = $1
  `;

  const result = await getPool().query(query, [userId]);
  return result.rows[0]?.last_email_sent || null;
}

/**
 * Update last email sent timestamp for a user
 */
async function updateLastEmailSent(userId) {
  const query = `
    INSERT INTO email_reminder_status (user_id, last_email_sent)
    VALUES ($1, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET last_email_sent = NOW()
  `;

  await getPool().query(query, [userId]);
}

/**
 * Get max frequency for a user (default: 24 hours)
 */
async function getMaxFrequency(userId) {
  const query = `
    SELECT frequency_millis
    FROM email_reminders_config
    WHERE user_id = $1
  `;

  const result = await getPool().query(query, [userId]);
  return result.rows[0]?.frequency_millis || DEFAULT_MAX_FREQUENCY_MILLIS;
}

/**
 * Check if enough time has passed since last email
 */
async function canSendEmail(userId, lastEmailSent, frequencyMillis) {
  if (!lastEmailSent) {
    return true;
  }

  const timeSinceLastEmail = Date.now() - new Date(lastEmailSent).getTime();
  return timeSinceLastEmail >= frequencyMillis;
}

/**
 * Collect all users with due todos and send them emails
 */
async function sendDueEmails(config) {
  const transporter = createTransporter(config);

  // Batch query to fetch all users with due todos, config, and status in one query
  const batchQuery = `
    SELECT DISTINCT
      u.user_id,
      u.email,
      erc.frequency_millis,
      ers.last_email_sent,
      t.id as todo_id,
      t.title,
      t.description,
      t.category,
      t.status,
      t.priority,
      t.due_date
    FROM users u
    LEFT JOIN email_reminders_config erc ON u.user_id = erc.user_id
    LEFT JOIN email_reminder_status ers ON u.user_id = ers.user_id
    LEFT JOIN todos t ON u.user_id = t.user_id
    WHERE t.due_date IS NOT NULL
      AND t.due_date <= now() + interval '${TODO_DUE_SOON_DAYS} days'
      AND t.status != 'completed'
    ORDER BY u.user_id, t.due_date
  `;

  const result = await getPool().query(batchQuery);
  const users = {};
  const usersNeedingUpdate = [];

  for (const row of result.rows) {
    if (!users[row.user_id]) {
      users[row.user_id] = {
        userId: row.user_id,
        email: row.email,
        frequencyMillis: row.frequency_millis || DEFAULT_MAX_FREQUENCY_MILLIS,
        lastEmailSent: row.last_email_sent,
        todos: [],
        canSend: canSendEmail(row.user_id, row.last_email_sent, row.frequency_millis || DEFAULT_MAX_FREQUENCY_MILLIS)
      };
    }

    if (row.todo_id) {
      users[row.user_id].todos.push({
        id: row.todo_id,
        title: row.title,
        description: row.description,
        category: row.category,
        status: row.status,
        priority: row.priority,
        due_date: row.due_date
      });
    }
  }

  let successCount = 0;
  let failureCount = 0;

  for (const userId of Object.keys(users)) {
    const user = users[userId];

    try {
      if (!user.canSend) {
        console.log(`Skipping ${userId}: too soon since last email`);
        continue;
      }

      if (user.todos.length === 0) {
        continue;
      }

      await sendUserEmail(transporter, userId, user.todos);
      usersNeedingUpdate.push(userId);
      successCount++;
    } catch (err) {
      console.error(`Failed to send email for user ${userId}:`, err.message);
      failureCount++;
    }
  }

  // Batch update last_email_sent for all sent users
  if (usersNeedingUpdate.length > 0) {
    const updateQuery = `
      INSERT INTO email_reminder_status (user_id, last_email_sent)
      VALUES (${usersNeedingUpdate.map(() => '($1)').join(',')})
      ON CONFLICT (user_id)
      DO UPDATE SET last_email_sent = NOW()
    `;

    await getPool().query(updateQuery, usersNeedingUpdate);
  }

  return { successCount, failureCount };
}

/**
 * Send email to a user with their due todos
 */
async function sendUserEmail(transporter, userId, todos) {
  // For demo purposes, first try to get user's email from todos table
  const userQuery = 'SELECT email FROM users WHERE user_id = $1';
  const userResult = await getPool().query(userQuery, [userId]);

  if (userResult.rows.length === 0) {
    throw new Error(`User ${userId} not found`);
  }

  const userEmail = userResult.rows[0].email;
  if (!userEmail) {
    throw new Error(`User ${userId} has no email address`);
  }

  // Calculate days until due
  const now = new Date();
  const daysUntilDue = todos.map(todo => {
    const due = new Date(todo.due_date);
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }).filter(d => d <= TODO_DUE_SOON_DAYS).length;

  const subject = `${todos.length} ${todos.length === 1 ? 'todo' : 'todos'} due soon (${daysUntilDue} days)`;

  // Format todos for email
  const todoListHtml = todos.map(todo => `
    <li>
      <strong>${todo.title}</strong> ${todo.due_date ? `(Due: ${todo.due_date})` : ''}
      ${todo.description ? `<br><small>${todo.description}</small>` : ''}
      ${todo.status !== 'pending' ? `<br><small>Status: ${todo.status}</small>` : ''}
    </li>
  `).join('');

  const html = `
    <h2>📝 Due Soon Tasks</h2>
    <p>You have ${todos.length} task${todos.length !== 1 ? 's' : ''} that are due within the next ${TODO_DUE_SOON_DAYS} days:</p>
    <ul>${todoListHtml}</ul>
    <p><a href="${config.frontendUrl}/todos">View all todos</a></p>
  `;

  await transporter.sendMail({
    from: config.fromEmail,
    to: userEmail,
    subject,
    html,
  });
}

/**
 * Manual trigger endpoint
 */
async function triggerNow(config) {
  return sendDueEmails(config);
}

/**
 * Schedule reminder emails
 */
function scheduleReminderCheck(config) {
  const interval = config.emailCheckInterval || 60 * 60 * 1000; // Default: hourly

  return setInterval(async () => {
    try {
      console.log(`Starting scheduled email check at ${new Date().toISOString()}`);
      const result = await sendDueEmails(config);
      console.log(`Email check complete: ${result.successCount} sent, ${result.failureCount} failed`);
    } catch (err) {
      console.error('Error in scheduled email check:', err);
    }
  }, interval);
}

module.exports = {
  TODO_DUE_SOON_DAYS,
  sendDueEmails,
  sendUserEmail,
  triggerNow,
  scheduleReminderCheck,
  canSendEmail,
};
