const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const openApiDocument = require('./openapi.json');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// Configuration (security)
// =====================
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Fatal: DATABASE_URL environment variable is required');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET; // may be absent when only /openapi.json is needed

// =====================
// Database
// =====================
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// =====================
// Middleware
// =====================
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '100kb';
app.use(bodyParser.json({ limit: JSON_BODY_LIMIT }));

const startTime = Date.now();

// Public endpoints used by gateways, health probes, and API discovery.
app.get('/openapi.json', (req, res) => {
  res.json(openApiDocument);
});

app.get('/api/docs/openapi.json', (req, res) => {
  res.json(openApiDocument);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const publicPaths = new Set(['/openapi.json', '/api/docs/openapi.json', '/health']);

function unauthorized(res, message = 'Unauthorized') {
  return res.status(401).json({ error: message });
}

function validateIntParam(value) {
  if (typeof value !== 'string') return null;
  if (!/^[0-9]+$/.test(value)) return null;
  // Keep as JS number (pg will serialize safely)
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

const allowedStatuses = new Set(['pending', 'in_progress', 'completed']);
const allowedPriorities = new Set(['low', 'medium', 'high']);
const allowedSortBy = new Set([
  'created_asc',
  'created_desc',
  'updated_asc',
  'updated_desc',
  'last_viewed_asc',
  'last_viewed_desc',
]);

function validateString(value, { minLen = 0, maxLen = 255 } = {}) {
  if (typeof value !== 'string') return null;
  if (value.length < minLen) return null;
  if (value.length > maxLen) return null;
  return value;
}

function isMetricsAuthorized(auth) {
  if (!auth || typeof auth !== 'object') return false;
  if (auth.role === 'admin') return true;
  if (auth.metrics === true) return true;
  if (Array.isArray(auth.scopes) && auth.scopes.includes('metrics:read')) return true;
  return false;
}

function authMiddleware(req, res, next) {
  if (publicPaths.has(req.path)) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Authorization Bearer token is required');
  }

  const token = authHeader.slice('Bearer '.length);
  if (!JWT_SECRET) {
    // Keep /openapi.json and /health working without JWT_SECRET; protect other endpoints.
    return res.status(503).json({ error: 'JWT_SECRET is not configured' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const userId = decoded.sub || decoded.user_id;
    if (!userId || typeof userId !== 'string') return unauthorized(res, 'Invalid token user');

    req.auth = decoded;
    req.userId = userId;
    return next();
  } catch (err) {
    return unauthorized(res, 'Invalid or expired token');
  }
}

// Simple in-memory rate limiting (best-effort). Recommended to replace with a shared limiter in production.
const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX || '60', 10);

function rateLimitMiddleware(req, res, next) {
  if (publicPaths.has(req.path)) return next();

  const key = req.ip;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  return next();
}

app.use(authMiddleware);
app.use(rateLimitMiddleware);

// ====================
// Ensure user exists
// ====================
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/todos')) return next();

  try {
    await pool.query(
      'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [req.userId]
    );
    return next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ====================
// METRICS ENDPOINTS
// ====================
app.get('/metrics', (req, res) => {
  if (!isMetricsAuthorized(req.auth)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const uptime = (Date.now() - startTime) / 1000; // uptime in seconds

  return res.json({
    uptime: uptime,
    uptime_seconds: Math.floor(uptime),
    uptime_readable: formatUptime(uptime),
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
  });
});

// ==================== TODO ENDPOINTS ====================

app.get('/todos', async (req, res) => {
  try {
    const { category, status, sort_by } = req.query;

    if (category !== undefined && category !== null) {
      if (typeof category !== 'string' || category.length > 100) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

    if (status !== undefined && status !== null) {
      if (typeof status !== 'string' || !allowedStatuses.has(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }

    const sortOption = sort_by || 'last_viewed_desc';
    if (typeof sortOption !== 'string' || !allowedSortBy.has(sortOption)) {
      return res.status(400).json({ error: 'Invalid sort_by' });
    }

    let query = 'SELECT * FROM todos WHERE user_id = $1';
    const params = [req.userId];
    let paramCount = 1;

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
        query += ' ORDER BY last_viewed DESC';
        break;
    }

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching todos:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/todos', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON body' });

    const title = validateString(body.title, { minLen: 1, maxLen: 255 });
    if (!title) {
      return res.status(400).json({ error: 'Title must be a string between 1 and 255 characters' });
    }

    let description = body.description;
    if (description !== undefined) {
      if (description === null) description = null;
      else {
        if (typeof description !== 'string' || description.length > 2000) {
          return res.status(400).json({ error: 'Invalid description' });
        }
      }
    }

    let category = body.category;
    if (category !== undefined) {
      if (category === null) category = null;
      else {
        const c = validateString(category, { minLen: 0, maxLen: 100 });
        if (c === null) return res.status(400).json({ error: 'Invalid category' });
        category = c;
      }
    }

    const status = body.status === undefined ? 'pending' : body.status;
    if (status !== null && (typeof status !== 'string' || !allowedStatuses.has(status))) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const priority = body.priority === undefined ? 'medium' : body.priority;
    if (priority !== null && (typeof priority !== 'string' || !allowedPriorities.has(priority))) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const result = await pool.query(
      'INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
      [req.userId, title, description || null, category || null, status, priority]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating todo:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/todos/:id', async (req, res) => {
  try {
    const id = validateIntParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await pool.query(
      'UPDATE todos SET last_viewed = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching todo:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/todos/:id', async (req, res) => {
  try {
    const id = validateIntParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON body' });

    const allowedFields = new Set(['title', 'description', 'category', 'status', 'priority']);
    for (const k of Object.keys(body)) {
      if (!allowedFields.has(k)) {
        return res.status(400).json({ error: `Unknown field: ${k}` });
      }
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (body.title !== undefined) {
      const v = validateString(body.title, { minLen: 1, maxLen: 255 });
      if (!v) return res.status(400).json({ error: 'Invalid title' });
      updateFields.push(`title = $${paramCount++}`);
      updateValues.push(v);
    }

    if (body.description !== undefined) {
      if (body.description === null) {
        updateFields.push(`description = $${paramCount++}`);
        updateValues.push(null);
      } else {
        if (typeof body.description !== 'string' || body.description.length > 2000) {
          return res.status(400).json({ error: 'Invalid description' });
        }
        updateFields.push(`description = $${paramCount++}`);
        updateValues.push(body.description);
      }
    }

    if (body.category !== undefined) {
      if (body.category === null) {
        updateFields.push(`category = $${paramCount++}`);
        updateValues.push(null);
      } else {
        const c = validateString(body.category, { minLen: 0, maxLen: 100 });
        if (c === null) return res.status(400).json({ error: 'Invalid category' });
        updateFields.push(`category = $${paramCount++}`);
        updateValues.push(c);
      }
    }

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !allowedStatuses.has(body.status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(body.status);
    }

    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string' || !allowedPriorities.has(body.priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      updateFields.push(`priority = $${paramCount++}`);
      updateValues.push(body.priority);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`last_viewed = NOW()`);
    updateValues.push(id, req.userId);

    const query = `UPDATE todos SET ${updateFields.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++} RETURNING *`;
    const result = await pool.query(query, updateValues);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating todo:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/todos/:id', async (req, res) => {
  try {
    const id = validateIntParam(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    return res.json({ message: 'Todo deleted successfully', deletedTodo: result.rows[0] });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

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

const server = app.listen(PORT, () => {
  console.log(`Metrics & Todo server running on http://localhost:${PORT}`);
  console.log(`Access openapi at http://localhost:${PORT}/openapi.json`);
  console.log(`Access metrics at http://localhost:${PORT}/metrics (requires authorized token)`);
  console.log('Access todos at /todos (requires Authorization: Bearer <token>)');
});
