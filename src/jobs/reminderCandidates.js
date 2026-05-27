function addDaysUtc(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnlyUtc(date) {
  return date.toISOString().slice(0, 10);
}

function getReminderWindow(now, lookaheadDays) {
  const startDate = toDateOnlyUtc(now);
  const endDate = toDateOnlyUtc(addDaysUtc(now, lookaheadDays || 0));
  return { startDate, endDate };
}

async function selectReminderCandidates(pool, startDate, endDate) {
  const result = await pool.query(
    `SELECT u.email, u.user_id, t.id, t.title, t.due_date, t.status, t.priority
FROM todos t
JOIN users u ON u.user_id = t.user_id
WHERE u.email IS NOT NULL
  AND t.due_date IS NOT NULL
  AND t.status <> 'completed'
  AND t.due_date BETWEEN $1::date AND $2::date
ORDER BY u.email ASC, t.due_date ASC, t.id ASC`,
    [startDate, endDate]
  );

  return result.rows || [];
}

function groupReminderCandidatesByEmail(rows) {
  const recipients = new Map();

  for (const row of rows) {
    if (!row.email) continue;
    if (!recipients.has(row.email)) {
      recipients.set(row.email, []);
    }
    recipients.get(row.email).push(row);
  }

  return recipients;
}

module.exports = {
  addDaysUtc,
  getReminderWindow,
  groupReminderCandidatesByEmail,
  selectReminderCandidates,
  toDateOnlyUtc,
};
