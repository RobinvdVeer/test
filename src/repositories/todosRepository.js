const { pool } = require('../db/pool');

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

  const parseOptionalNonNegativeInt = (v) => {
    if (v === undefined || v === null) return null;
    const n = Number.parseInt(v, 10);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    return n;
  };

  const requestedLimit = parseOptionalNonNegativeInt(limit);
  const requestedOffset = parseOptionalNonNegativeInt(offset);

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

  // Apply optional pagination only when a valid limit is provided.
  const applyLimit = requestedLimit !== null;
  if (applyLimit) {
    paramCount += 1;
    query += ` LIMIT $${paramCount}`;
    params.push(Math.min(requestedLimit, 100));

    // OFFSET is only meaningful when LIMIT is set.
    paramCount += 1;
    query += ` OFFSET $${paramCount}`;
    params.push(requestedOffset ?? 0);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

async function createTodo(userId, { title, description, category, status, priority }) {
  const result = await pool.query(
    'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      userId,
      title,
      description || null,
      category || null,
      status || 'pending',
      priority || 'medium',
    ]
  );

  return result.rows[0];
}

async function getTodoAndUpdateLastViewed(userId, id) {
  const result = await pool.query(
    'UPDATE todos SET last_viewed = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );

  return result.rows[0] || null;
}

async function updateTodo(userId, id, { title, description, category, status, priority }) {
  // First, check if todo exists and belongs to user
  const checkResult = await pool.query(
    'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
    [id, userId]
  );

  if (checkResult.rows.length === 0) {
    return null;
  }

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
  updateValues.push(id, userId);

  const query = `UPDATE todos SET ${updateFields.join(
    ', '
  )} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;

  const result = await pool.query(query, updateValues);
  return result.rows[0] || null;
}

async function deleteTodo(userId, id) {
  const result = await pool.query(
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
