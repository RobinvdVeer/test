const express = require('express');
const todoRepository = require('../repositories/todoRepository');
const userRepository = require('../repositories/userRepository');

const DEFAULT_TODOS_LIMIT = 100;
const MAX_TODOS_LIMIT = 500;

function createTodosRouter({ pool, authenticateJwt }) {
  const router = express.Router();

  router.use(authenticateJwt, async (req, res, next) => {
    try {
      await userRepository.ensureUserExists(pool, req.userId);
      next();
    } catch (error) {
      console.error('Error ensuring user exists:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const requestedLimit = req.query.limit === undefined ? DEFAULT_TODOS_LIMIT : Number.parseInt(req.query.limit, 10);
      const requestedOffset = req.query.offset === undefined ? 0 : Number.parseInt(req.query.offset, 10);

      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_TODOS_LIMIT) {
        return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_TODOS_LIMIT}` });
      }

      if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer' });
      }

      const todos = await todoRepository.listTodos(pool, req.userId, {
        ...req.query,
        limit: requestedLimit,
        offset: requestedOffset,
      });
      res.json(todos);
    } catch (error) {
      console.error('Error fetching todos:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!req.body.title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const todo = await todoRepository.createTodo(pool, req.userId, req.body);
      res.status(201).json(todo);
    } catch (error) {
      console.error('Error creating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const todo = await todoRepository.touchAndGetTodo(pool, req.userId, req.params.id);

      if (!todo) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json(todo);
    } catch (error) {
      console.error('Error fetching todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { noFields, todo } = await todoRepository.updateTodo(pool, req.userId, req.params.id, req.body);

      if (noFields) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      if (!todo) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json(todo);
    } catch (error) {
      console.error('Error updating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const deletedTodo = await todoRepository.deleteTodo(pool, req.userId, req.params.id);

      if (!deletedTodo) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json({ message: 'Todo deleted successfully', deletedTodo });
    } catch (error) {
      console.error('Error deleting todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createTodosRouter;
