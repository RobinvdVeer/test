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

module.exports = {
  buildReminderSubject,
  buildReminderText,
};
