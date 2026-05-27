const { getPool } = require('../db/pool');
const {
  DEFAULT_TODO_PRIORITY,
  DEFAULT_TODO_STATUS,
  VALID_PRIORITY,
  VALID_STATUS,
} = require('../todos/rules');

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, '\\$&');
}

function appendTextSearchFilter(query, params, paramCount, q) {
  const trimmedQuery = typeof q === 'string' ? q.trim() : '';
  if (!trimmedQuery) {
    return { query, paramCount };
  }

  paramCount += 1;
  query += ` AND (title ILIKE $${paramCount} ESCAPE '\\' OR COALESCE(description, '') ILIKE $${paramCount} ESCAPE '\\' OR COALESCE(category, '') ILIKE $${paramCount} ESCAPE '\\')`;
  params.push(`%${escapeLikePattern(trimmedQuery)}%`);

  return { query, paramCount };
}

function appendCategoryStatusFilters(query, params, paramCount, { category, status }) {
  if (category) {
    paramCount += 1;
    query += ` AND category = $${paramCount}`;
    params.push(category);
  }

  if (status) {
    paramCount += 1;
    query += ` AND status = $${paramCount}`;
    params.push(status);
  }

  return { query, paramCount };
}

function applyListOrdering(query, sort_by) {
  const sortOption = sort_by || 'last_viewed_desc';
  switch (sortOption) {
    case 'created_asc':
      return `${query} ORDER BY created_at ASC`;
    case 'created_desc':
      return `${query} ORDER BY created_at DESC`;
    case 'updated_asc':
      return `${query} ORDER BY updated_at ASC`;
    case 'updated_desc':
      return `${query} ORDER BY updated_at DESC`;
    case 'last_viewed_asc':
      return `${query} ORDER BY last_viewed ASC`;
    case 'last_viewed_desc':
    default:
      return `${query} ORDER BY last_viewed DESC`;
  }
}

function applyPagination(query, params, paramCount, { limit, offset }) {
  // Route parsing turns:
  // - missing/invalid limit/offset into `undefined`
  // - valid numbers into integers
  const requestedLimit = limit;
  const requestedOffset = offset;

  const DEFAULT_LIMIT = 50;
  const MAX_LIMIT = 100;

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

  return { query, params };
}

async function listTodos(userId, { category, status, q, sort_by, limit, offset }) {
  let query = 'SELECT * FROM todos WHERE user_id = $1';
  let params = [userId];
  let paramCount = 1;

  ({ query, paramCount } = appendCategoryStatusFilters(query, params, paramCount, { category, status }));
  ({ query, paramCount } = appendTextSearchFilter(query, params, paramCount, q));
  query = applyListOrdering(query, sort_by);
  ({ query, params } = applyPagination(query, params, paramCount, { limit, offset }));

  const result = await getPool().query(query, params);
  return result.rows;
}

async function getTodoSummary(userId, { category, status, q }) {
  let query = `SELECT
  COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
  COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
  COUNT(*) FILTER (WHERE priority = 'low')::int AS low,
  COUNT(*) FILTER (WHERE priority = 'medium')::int AS medium,
  COUNT(*) FILTER (WHERE priority = 'high')::int AS high,
  MAX(created_at) AS latest_created_at,
  MAX(updated_at) AS latest_updated_at
FROM todos WHERE user_id = $1`;
  const params = [userId];
  let paramCount = 1;

  ({ query, paramCount } = appendCategoryStatusFilters(query, params, paramCount, { category, status }));
  ({ query, paramCount } = appendTextSearchFilter(query, params, paramCount, q));

  const result = await getPool().query(query, params);
  const row = result.rows[0] || {};

  return {
    total: Number(row.total || 0),
    status_counts: {
      pending: Number(row.pending || 0),
      in_progress: Number(row.in_progress || 0),
      completed: Number(row.completed || 0),
    },
    priority_counts: {
      low: Number(row.low || 0),
      medium: Number(row.medium || 0),
      high: Number(row.high || 0),
    },
    latest_created_at: row.latest_created_at || null,
    latest_updated_at: row.latest_updated_at || null,
  };
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

async function createTodo(userId, { title, description, category, status, priority }) {
  const statusToUse = status || DEFAULT_TODO_STATUS;
  const priorityToUse = priority || DEFAULT_TODO_PRIORITY;

  validateStatusPriority({ status: statusToUse, priority: priorityToUse });

  const result = await getPool().query(
    'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      userId,
      title,
      description || null,
      category || null,
      statusToUse,
      priorityToUse,
    ]
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

async function updateTodo(userId, id, { title, description, category, status, priority }) {
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
  getTodoSummary,
  createTodo,
  getTodoAndUpdateLastViewed,
  updateTodo,
  deleteTodo,
};
