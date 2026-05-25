const express = require('express');
const {
  listTodos,
  createTodo,
  getTodoAndUpdateLastViewed,
  updateTodo,
  deleteTodo,
} = require('../repositories/todosRepository');

const VALID_STATUS = new Set(['pending', 'in_progress', 'completed']);
const VALID_PRIORITY = new Set(['low', 'medium', 'high']);
const VALID_SORT_BY = new Set([
  'created_asc',
  'created_desc',
  'updated_asc',
  'updated_desc',
  'last_viewed_asc',
  'last_viewed_desc',
]);

function withErrorHandling(logPrefix, handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(logPrefix, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function parseOptionalNonNegativeInt(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isSafeInteger(n) || n < 0) return undefined;
  return n;
}

function normalizeSortBy(sortBy) {
  if (sortBy === undefined) return undefined;
  return VALID_SORT_BY.has(sortBy) ? sortBy : undefined;
}

function validateEnumOr400(value, validSet, fieldName, res) {
  // Treat null/empty-string as "missing" so repository defaults can apply.
  if (value === undefined || value === null || value === '') return true;

  if (!validSet.has(value)) {
    res.status(400).json({ error: `Invalid ${fieldName}` });
    return false;
  }

  return true;
}

function isValidNumericId(id) {
  return typeof id === 'string' && /^\d+$/.test(id);
}

function registerTodosRoutes() {
  const router = express.Router();

  // GET /todos - List all todos for the user with optional filtering
  router.get(
    '/',
    withErrorHandling('Error fetching todos:', async (req, res) => {
      const { category, status, sort_by, limit, offset } = req.query;

      const result = await listTodos(req.userId, {
        category,
        status,
        sort_by: normalizeSortBy(sort_by),
        limit: parseOptionalNonNegativeInt(limit),
        offset: parseOptionalNonNegativeInt(offset),
      });

      res.json(result);
    })
  );

  // POST /todos - Create a new todo
  router.post(
    '/',
    withErrorHandling('Error creating todo:', async (req, res) => {
      const { title, description, category, status, priority } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      if (!validateEnumOr400(status, VALID_STATUS, 'status', res)) return;
      if (!validateEnumOr400(priority, VALID_PRIORITY, 'priority', res)) return;

      const result = await createTodo(req.userId, {
        title,
        description,
        category,
        status,
        priority,
      });

      res.status(201).json(result);
    })
  );

  // GET /todos/:id - Get a specific todo and update last_viewed
  router.get(
    '/:id',
    withErrorHandling('Error fetching todo:', async (req, res) => {
      const { id } = req.params;

      if (!isValidNumericId(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const result = await getTodoAndUpdateLastViewed(req.userId, id);
      if (!result) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json(result);
    })
  );

  // PUT /todos/:id - Update a todo
  router.put(
    '/:id',
    withErrorHandling('Error updating todo:', async (req, res) => {
      const { id } = req.params;
      const { title, description, category, status, priority } = req.body;

      if (!isValidNumericId(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      if (!validateEnumOr400(status, VALID_STATUS, 'status', res)) return;
      if (!validateEnumOr400(priority, VALID_PRIORITY, 'priority', res)) return;

      const result = await updateTodo(req.userId, id, {
        title,
        description,
        category,
        status,
        priority,
      });

      if (result && result.type === 'NO_FIELDS_TO_UPDATE') {
        return res.status(400).json({ error: 'No fields to update' });
      }

      if (!result) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json(result);
    })
  );

  // DELETE /todos/:id - Delete a todo
  router.delete(
    '/:id',
    withErrorHandling('Error deleting todo:', async (req, res) => {
      const { id } = req.params;

      if (!isValidNumericId(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }

      const result = await deleteTodo(req.userId, id);
      if (!result) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json({ message: 'Todo deleted successfully', deletedTodo: result });
    })
  );

  return router;
}

module.exports = { registerTodosRoutes };
