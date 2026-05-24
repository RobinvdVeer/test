const SORT_OPTIONS = {
  created_asc: 'created_at ASC',
  created_desc: 'created_at DESC',
  updated_asc: 'updated_at ASC',
  updated_desc: 'updated_at DESC',
  last_viewed_asc: 'last_viewed ASC',
  last_viewed_desc: 'last_viewed DESC',
};

const UPDATEABLE_FIELDS = ['title', 'description', 'category', 'status', 'priority'];

function nullable(value) {
  return value === undefined ? null : value;
}

async function listTodos(pool, userId, filters = {}) {
  const { category, status, sort_by } = filters;
  let query = 'SELECT * FROM todos WHERE user_id = $1';
  const params = [userId];

  if (category) {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }

  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  query += ` ORDER BY ${SORT_OPTIONS[sort_by] || SORT_OPTIONS.last_viewed_desc}`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function createTodo(pool, userId, input) {
  const result = await pool.query(
    'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [userId, input.title, nullable(input.description), nullable(input.category), input.status || 'pending', input.priority || 'medium']
  );

  return result.rows[0];
}

async function touchAndGetTodo(pool, userId, id) {
  const result = await pool.query(
    'UPDATE todos SET last_viewed = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );

  return result.rows[0] || null;
}

function buildUpdatePatch(patch) {
  const updateFields = [];
  const updateValues = [];

  for (const field of UPDATEABLE_FIELDS) {
    if (patch[field] !== undefined) {
      updateValues.push(patch[field]);
      updateFields.push(`${field} = $${updateValues.length}`);
    }
  }

  return { updateFields, updateValues };
}

async function updateTodo(pool, userId, id, patch) {
  const { updateFields, updateValues } = buildUpdatePatch(patch);

  if (updateFields.length === 0) {
    return { noFields: true, todo: null };
  }

  updateFields.push('updated_at = NOW()');
  updateFields.push('last_viewed = NOW()');
  updateValues.push(id, userId);

  const idParam = updateValues.length - 1;
  const userIdParam = updateValues.length;
  const query = `UPDATE todos SET ${updateFields.join(', ')} WHERE id = $${idParam} AND user_id = $${userIdParam} RETURNING *`;
  const result = await pool.query(query, updateValues);

  return { noFields: false, todo: result.rows[0] || null };
}

async function deleteTodo(pool, userId, id) {
  const result = await pool.query(
    'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  listTodos,
  createTodo,
  touchAndGetTodo,
  updateTodo,
  deleteTodo,
};
