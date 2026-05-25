const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const openApiDocument = require('./openapi.json');
const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://todouser:todopass@localhost:5432/tododb',
});

// Middleware
app.use(bodyParser.json());

// Store the process start time
const startTime = Date.now();

// Public endpoints used by gateways, health probes, and API discovery.
app.get('/openapi.json', (req, res) => {
  res.json(openApiDocument);
});

app.get('/api/docs/openapi.json', (req, res) => {
  res.json(openApiDocument);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware to extract and validate user from header
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(400).json({ error: 'X-User-Id header is required' });
  }
  req.userId = userId;
  next();
});

// Middleware to ensure user exists in database
app.use(async (req, res, next) => {
  try {
    await pool.query(
      'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [req.userId]
    );
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== METRICS ENDPOINTS ====================

// /metrics endpoint that returns process uptime
app.get('/metrics', (req, res) => {
  const uptime = (Date.now() - startTime) / 1000; // uptime in seconds
  
  res.json({
    uptime: uptime,
    uptime_seconds: Math.floor(uptime),
    uptime_readable: formatUptime(uptime),
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  });
});

// ==================== TODO ENDPOINTS ====================

// GET /todos - List all todos for the user with optional filtering
app.get('/todos', async (req, res) => {
  try {
    const { category, status, sort_by } = req.query;
    let query = 'SELECT * FROM todos WHERE user_id = $1';
    const params = [req.userId];
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

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /todos - Create a new todo
app.post('/todos', async (req, res) => {
  try {
    const { title, description, category, status, priority } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await pool.query(
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [req.userId, title, description || null, category || null, status || 'pending', priority || 'medium']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating todo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /todos/:id - Get a specific todo and update last_viewed
app.get('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Update last_viewed timestamp
    const result = await pool.query(
      'UPDATE todos SET last_viewed = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching todo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /todos/:id - Update a todo
app.put('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, status, priority } = req.body;

    // First, check if todo exists and belongs to user
    const checkResult = await pool.query(
      'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const currentTodo = checkResult.rows[0];

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
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`last_viewed = NOW()`);
    updateValues.push(id, req.userId);

    const query = `UPDATE todos SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;
    const result = await pool.query(query, updateValues);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /todos/:id - Delete a todo
app.delete('/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ message: 'Todo deleted successfully', deletedTodo: result.rows[0] });
  } catch (error) {
    console.error('Error deleting todo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to format uptime in a readable way
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

let server;

if (require.main === module) {
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
      });
    });
  });

  server = app.listen(PORT, () => {
    console.log(`Metrics & Todo server running on http://localhost:${PORT}`);
    console.log(`Access metrics at http://localhost:${PORT}/metrics`);
    console.log(`Access todos at http://localhost:${PORT}/todos (requires X-User-Id header)`);
  });
}

module.exports = { app, pool, formatUptime };
