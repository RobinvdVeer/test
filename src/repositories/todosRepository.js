const { getPool } = require('../db/pool');
const {
  DEFAULT_TODO_PRIORITY,
  DEFAULT_TODO_STATUS,
  VALID_PRIORITY,
  VALID_STATUS,
} = require('../todos/rules');

async function listTodos(userId, { category, status, sort_by, limit, offset }) {
  let query = 'SELECT * FROM todos WHERE user_id = $1';
  const params = [userId];
  let paramCount = 1;

  if (category) {
    paramCount++;
    query += ` AND category = $${paramCount}`;
    params.push(category);
  }

  if (status) {
    paramCount++;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  // Route parsing turns:
  // - missing/invalid limit/offset into `undefined`
  // - valid numbers into integers
  const requestedLimit = limit;
  const requestedOffset = offset;

  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 100;

  // Default sort by last_viewed (most recently viewed first)
  const sortOption = sort_by || 'last_viewed_desc';
  switch (sortOption) {
    case 'created_asc':
      query += ' ORDER BY created_at ASC';
      break;
    case 'created_desc':
      query += ' ORDER BY created_at DESC';
      break;
    case 'updated_asc':
      query += ' ORDER BY updated_at ASC';
      break;
    case 'updated_desc':
      query += ' ORDER BY updated_at DESC';
      break;
    case 'last_viewed_asc':
      query += ' ORDER BY last_viewed ASC';
      break;
    case 'last_viewed_desc':
    default:
      query += ' ORDER BY last_viewed DESC';
  }

  // Pagination semantics (asserted by tests):
  // - If LIMIT is missing and OFFSET is also missing => apply defaults (50, 0)
  // - If LIMIT is missing but OFFSET is provided => omit LIMIT/OFFSET entirely
  // - If LIMIT is present/valid => apply LIMIT (clamped) and OFFSET (default 0)
  if (requestedLimit === undefined) {
    if (requestedOffset === undefined) {
      paramCount += 1;
      query += ` LIMIT $${paramCount}`;
      params.push(DEFAULT_LIMIT);

      paramCount += 1;
      query += ` OFFSET $${paramCount}`;
      params.push(0);
    }
  } else {
    const safeLimit = Math.min(requestedLimit, MAX_LIMIT);
    paramCount += 1;
    query += ` LIMIT $${paramCount}`;
    params.push(safeLimit);

    const safeOffset = requestedOffset === undefined ? 0 : requestedOffset;
    paramCount += 1;
    query += ` OFFSET $${paramCount}`;
    params.push(safeOffset);
  }

  const result = await getPool().query(query, params);
  return result.rows;
}

function validateStatusPriority({ status, priority }) {
  const err = new Error('Status must be one of: pending, in_progress, completed');
  err.code = 'INVALID_STATUS_PRIORITY';

  if (status !== undefined && status !== null && !VALID_STATUS.has(status)) {
    throw err;
  }

  if (priority !== undefined && priority !== null && !VALID_PRIORITY.has(priority)) {
    throw err;
  }
}

function validateDueDate(dueDate) {
  if (dueDate === undefined || dueDate === null || dueDate === '') return null;
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const err = new Error('Invalid due date');
    err.code = 'INVALID_DUE_DATE';
    throw err;
  }

  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) {
    const err = new Error('Invalid due date');
    err.code = 'INVALID_DUE_DATE';
    throw err;
  }

  return dueDate;
}

async function createTodo(userId, { title, description, category, status, priority, due_date }) {
  const statusToUse = status || DEFAULT_TODO_STATUS;
  const priorityToUse = priority || DEFAULT_TODO_PRIORITY;
  const dueDateToUse = validateDueDate(due_date);

  validateStatusPriority({ status: statusToUse, priority: priorityToUse });

  const columns = ['user_id', 'title', 'description', 'category', 'status', 'priority'];
  const values = [userId, title, description || null, category || null, statusToUse, priorityToUse];

  if (dueDateToUse !== null) {
    columns.push('due_date');
    values.push(dueDateToUse);
  }

  columns.push('last_viewed');

  const placeholders = columns.map((_, index) => (index === columns.length - 1 ? 'NOW()' : `$${index + 1}`));

  const result = await getPool().query(
    `INSERT INTO todos (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );

  return result.rows[0];
}

async function getTodoAndUpdateLastViewed(userId, id) {
  // Avoid writing to the DB on every read.
  // Only bump `last_viewed` if it's stale (older than 60s), but always return
  // the todo if it exists.
  const result = await getPool().query(
    `WITH updated AS (
  UPDATE todos
  SET last_viewed = NOW()
  WHERE id = $1 AND user_id = $2
    AND (last_viewed IS NULL OR last_viewed < NOW() - interval '60 seconds')
  RETURNING *
)
SELECT * FROM updated
UNION ALL
SELECT * FROM todos
WHERE id = $1 AND user_id = $2
  AND NOT EXISTS (SELECT 1 FROM updated);`,
    [id, userId]
  );

  return result.rows[0] || null;
}

async function updateTodo(userId, id, { title, description, category, status, priority, due_date }) {
  validateStatusPriority({ status, priority });

  // Update only provided fields
  const updateFields = [];
  const updateValues = [];
  let paramCount = 1;

  if (title !== undefined) {
    updateFields.push(`title = $${paramCount++}`);
    updateValues.push(title);
  }
  if (description !== undefined) {
    updateFields.push(`description = $${paramCount++}`);
    updateValues.push(description);
  }
  if (category !== undefined) {
    updateFields.push(`category = $${paramCount++}`);
    updateValues.push(category);
  }
  if (status !== undefined) {
    updateFields.push(`status = $${paramCount++}`);
    updateValues.push(status);
  }
  if (priority !== undefined) {
    updateFields.push(`priority = $${paramCount++}`);
    updateValues.push(priority);
  }
  if (due_date !== undefined) {
    updateFields.push(`due_date = $${paramCount++}`);
    updateValues.push(validateDueDate(due_date));
  }

  if (updateFields.length === 0) {
    // Let route translate this to 400
    return { type: 'NO_FIELDS_TO_UPDATE' };
  }

  updateFields.push('updated_at = NOW()');
  updateFields.push('last_viewed = NOW()');

  const query = `UPDATE todos SET ${updateFields.join(
    ', '
  )} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;

  // Append WHERE-clause args at the end.
  updateValues.push(id, userId);

  const result = await getPool().query(query, updateValues);
  return result.rows[0] || null;
}

async function deleteTodo(userId, id) {
  const result = await getPool().query(
    'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  listTodos,
  createTodo,
  getTodoAndUpdateLastViewed,
  updateTodo,
  deleteTodo,
};
