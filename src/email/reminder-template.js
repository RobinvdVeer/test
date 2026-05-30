/**
 * Email template for todo reminders
 */
function generateReminderEmail(todo, userPreferences) {
  const { title, description, priority, created_at, due_date, category, id } = todo;
  const daysUntilDue = calculateDaysUntilDue(due_date);

  return {
    from: `"Todo Reminders" <${userPreferences.smtpFrom || 'no-reply@todo.example.com'}>`,
    to: todo.email,
    subject: `Reminder: "${title}" is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`,
    text: `Hello,\n\nThis is a reminder about your todo: "${title}"\n\nDue date: ${due_date}\nPriority: ${priority}\n${category ? `Category: ${category}\n` : ''}${description ? `Description: ${description}\n` : ''}\n\nYou can view and manage this todo at the application.\n\nNote: You have ${userPreferences.reminderInterval || 'daily'} reminders enabled for todos due within 2 days.`,
    html: generateHtmlReminder(title, description, priority, category, due_date, created_at, daysUntilDue, id, userPreferences.smtpFrom),
  };
}

function calculateDaysUntilDue(dueDate) {
  if (!dueDate) return 'unknown';

  const due = new Date(dueDate);
  const today = new Date();
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function generateHtmlReminder(title, description, priority, category, dueDate, createdAt, daysUntilDue, todoId, smtpFrom) {
  const priorityColors = {
    low: '#00a65a',
    medium: '#f39c12',
    high: '#dd4b39',
  };

  const priorityColor = priorityColors[priority] || priorityColors.medium;
  const now = new Date().toLocaleString();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo Reminder</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #f4f6f9;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      text-align: center;
      color: white;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px;
    }
    .todo-card {
      background-color: #f8f9fa;
      border-left: 4px solid ${priorityColor || '#999'};
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .todo-title {
      font-size: 20px;
      font-weight: 600;
      color: #333;
      margin: 0 0 10px 0;
    }
    .todo-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      font-size: 14px;
      color: #666;
      margin-top: 15px;
    }
    .todo-meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .meta-label {
      font-weight: 600;
      color: #555;
    }
    .todo-description {
      margin: 15px 0 0 0;
      color: #444;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #999;
      border-top: 1px solid #e9ecef;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: white;
      background-color: ${priorityColor};
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Todo Reminder</h1>
    </div>
    <div class="content">
      <p style="color: #666; font-size: 14px;">${now}</p>

      <h2 style="color: #333; font-size: 18px; margin-top: 0;">A todo is due soon</h2>

      <div class="todo-card">
        <h3 class="todo-title">${escapeHtml(title)}</h3>

        <div class="todo-meta">
          <div class="todo-meta-item">
            <span class="meta-label">Due:</span>
            <span style="color: #667eea; font-weight: 500;">${dueDate || 'Not set'}</span>
          </div>
          <div class="todo-meta-item">
            <span class="meta-label">Priority:</span>
            <span class="badge">${priority || 'medium'}</span>
          </div>
          ${category ? `
          <div class="todo-meta-item">
            <span class="meta-label">Category:</span>
            <span>${escapeHtml(category)}</span>
          </div>
          ` : ''}
        </div>

        ${description ? `
        <div class="todo-description">${escapeHtml(description)}</div>
        ` : ''}

        <div style="margin-top: 20px; text-align: center;">
          <a href="https://todo.example.com/todos/${todoId}" style="
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            margin-top: 10px;
          ">
            View Todo
          </a>
        </div>
      </div>

      <p style="color: #666; font-size: 14px;">
        This reminder was sent because the todo is due in <strong>${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}</strong>.
      </p>

      <p style="color: #666; font-size: 14px;">
        You can manage your notification preferences in the application settings.
      </p>
    </div>
    <div class="footer">
      <p>If you did not expect this email, you can update your notification preferences in the app settings.</p>
      <p>This is an automated message from ${smtpFrom || 'Todo App'}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

module.exports = {
  generateReminderEmail,
  calculateDaysUntilDue,
};
