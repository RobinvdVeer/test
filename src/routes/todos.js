const express = require('express');
const {
  listTodos,
  createTodo,
  getTodoAndUpdateLastViewed,
  updateTodo,
  deleteTodo,
} = require('../repositories/todosRepository');

function registerTodosRoutes() {
  const router = express.Router();

  // GET /todos - List all todos for the user with optional filtering
  router.get('/', async (req, res) => {
    try {
      const { category, status, sort_by } = req.query;
      const result = await listTodos(req.userId, { category, status, sort_by });
      res.json(result);
    } catch (error) {
      console.error('Error fetching todos:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /todos - Create a new todo
  router.post('/', async (req, res) => {
    try {
      const { title, description, category, status, priority } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const result = await createTodo(req.userId, {
        title,
        description,
        category,
        status,
        priority,
      });

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /todos/:id - Get a specific todo and update last_viewed
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await getTodoAndUpdateLastViewed(req.userId, id);
      if (!result) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error fetching todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /todos/:id - Update a todo
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, category, status, priority } = req.body;

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
    } catch (error) {
      console.error('Error updating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /todos/:id - Delete a todo
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await deleteTodo(req.userId, id);
      if (!result) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json({ message: 'Todo deleted successfully', deletedTodo: result });
    } catch (error) {
      console.error('Error deleting todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = { registerTodosRoutes };
