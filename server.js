const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_ISSUER = process.env.AUTH_ISSUER || 'http://localhost:8080/realms/local-dev';
const PUBLIC_AUTH_ISSUER = process.env.PUBLIC_AUTH_ISSUER || AUTH_ISSUER;
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'todo-app';
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE || AUTH_CLIENT_ID;
const AUTH_JWKS_URI = process.env.AUTH_JWKS_URI || `${AUTH_ISSUER}/protocol/openid-connect/certs`;
const AUTH_REQUIRED_ROLE = process.env.AUTH_REQUIRED_ROLE || 'user';
const DEFAULT_TODOS_LIMIT = 100;
const MAX_TODOS_LIMIT = 500;

const jwks = jwksClient({
  jwksUri: AUTH_JWKS_URI,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://todouser:todopass@localhost:5432/tododb',
});

// Middleware
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Store the process start time
const startTime = Date.now();

function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, (error, key) => {
    if (error) return callback(error);
    callback(null, key.getPublicKey());
  });
}

function tokenRoles(decoded) {
  return [
    ...(decoded.realm_access?.roles || []),
    ...Object.values(decoded.resource_access || {}).flatMap((access) => access.roles || []),
  ];
}

// Middleware to validate JWT bearer tokens and extract the stable user id from sub.
function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Bearer token is required' });
  }

  jwt.verify(
    token,
    getSigningKey,
    {
      algorithms: ['RS256'],
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE,
    },
    (error, decoded) => {
      if (error) {
        return res.status(401).json({ error: 'Invalid or expired bearer token' });
      }

      if (AUTH_REQUIRED_ROLE && !tokenRoles(decoded).includes(AUTH_REQUIRED_ROLE)) {
        return res.status(403).json({ error: `Required role '${AUTH_REQUIRED_ROLE}' is missing` });
      }

      req.auth = decoded;
      req.userId = decoded.sub;
      next();
    }
  );
}

app.use('/todos', authenticateJwt);

// ==================== AUTH DISCOVERY ENDPOINT ====================

app.get('/auth/config', (req, res) => {
  res.json({
    issuer: PUBLIC_AUTH_ISSUER,
    clientId: AUTH_CLIENT_ID,
    audience: AUTH_AUDIENCE,
    authorizationEndpoint: `${PUBLIC_AUTH_ISSUER}/protocol/openid-connect/auth`,
    tokenEndpoint: `${PUBLIC_AUTH_ISSUER}/protocol/openid-connect/token`,
    logoutEndpoint: `${PUBLIC_AUTH_ISSUER}/protocol/openid-connect/logout`,
    pkceMethod: 'S256',
  });
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ==================== TODO ENDPOINTS ====================

// GET /todos - List all todos for the user with optional filtering
app.get('/todos', async (req, res) => {
  try {
    const { category, status, sort_by } = req.query;
    const requestedLimit = req.query.limit === undefined ? DEFAULT_TODOS_LIMIT : Number.parseInt(req.query.limit, 10);
    const requestedOffset = req.query.offset === undefined ? 0 : Number.parseInt(req.query.offset, 10);

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_TODOS_LIMIT) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_TODOS_LIMIT}` });
    }

    if (!Number.isInteger(requestedOffset) || requestedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

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

    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(requestedLimit, requestedOffset);

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
      `WITH ensured_user AS (
        INSERT INTO users (user_id) VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      )
      INSERT INTO todos (user_id, title, description, category, status, priority, last_viewed)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *`,
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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

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
  console.log(`Access metrics at http://localhost:${PORT}/metrics`);
  console.log(`Access todos at http://localhost:${PORT}/todos (requires JWT bearer token)`);
  console.log(`OIDC config at http://localhost:${PORT}/auth/config`);
});
