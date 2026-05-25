const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const {
  isBearerToken,
  isKeycloakConfigured,
  verifyKeycloakJwt,
} = require('../auth/keycloak');

// Cache user existence checks to avoid a DB round-trip on every request.
// This is a best-effort optimization; users are still upserted when the
// cached value expires.
const USER_UPsert_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const USER_UPsert_CACHE_MAX_ENTRIES = 10_000;

const knownUsers = new Map(); // userId -> firstSeenAtMs

function isKnownUserFresh(userId, nowMs) {
  const firstSeenAt = knownUsers.get(userId);
  return firstSeenAt !== undefined && nowMs - firstSeenAt < USER_UPsert_CACHE_TTL_MS;
}

function rememberUser(userId, nowMs) {
  knownUsers.set(userId, nowMs);

  // Prune oldest entries if we exceed bounds.
  if (knownUsers.size > USER_UPsert_CACHE_MAX_ENTRIES) {
    const overflow = knownUsers.size - USER_UPsert_CACHE_MAX_ENTRIES;
    let i = 0;
    for (const [id] of knownUsers) {
      if (i >= overflow) break;
      knownUsers.delete(id);
      i += 1;
    }
  }
}

async function ensureUserExists(userId) {
  const nowMs = Date.now();
  if (isKnownUserFresh(userId, nowMs)) return;

  await pool.query(
    'INSERT INTO users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  );

  rememberUser(userId, nowMs);
}

function legacyUserIdFromBearer(authHeader) {
  if (!isBearerToken(authHeader)) return undefined;

  const token = authHeader.slice('Bearer '.length);
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Server misconfigured');
  }

  const payload = jwt.verify(token, jwtSecret);
  return payload?.sub ?? payload?.userId ?? payload?.user_id;
}

async function keycloakUserIdFromBearer(authHeader) {
  if (!isBearerToken(authHeader)) return undefined;

  const token = authHeader.slice('Bearer '.length);
  const payload = await verifyKeycloakJwt(token);
  return payload?.sub;
}

async function userMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const xUserId = req.headers['x-user-id'];
  const reqPath = req.path;
  const keycloakMode = isKeycloakConfigured();

  const getUserIdFromBearer = async () => {
    if (keycloakMode) return keycloakUserIdFromBearer(authHeader);
    return legacyUserIdFromBearer(authHeader);
  };

  let userId;

  // Route-specific error messages are asserted in tests.
  if (reqPath === '/todos' || reqPath === '/todos/') {
    // /todos base route accepts Bearer only in Keycloak mode.
    try {
      userId = await getUserIdFromBearer();
    } catch (e) {
      if (e.message === 'Server misconfigured') {
        return res.status(500).json({ error: 'Server misconfigured' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId) {
      if (keycloakMode) {
        return res
          .status(401)
          .json({ error: 'Authorization bearer token is required' });
      }

      if (!xUserId || typeof xUserId !== 'string') {
        return res
          .status(401)
          .json({ error: 'Authorization bearer token is required' });
      }
      userId = xUserId;
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
  } else if (reqPath === '/metrics') {
    // /metrics: legacy tests expect X-User-Id when no keycloak config is active.
    try {
      userId = keycloakMode ? await getUserIdFromBearer() : xUserId || (await getUserIdFromBearer());
    } catch (e) {
      if (e.message === 'Server misconfigured') {
        return res.status(500).json({ error: 'Server misconfigured' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(keycloakMode ? 401 : 400).json({
        error: keycloakMode ? 'Authorization bearer token is required' : 'X-User-Id header is required',
      });
    }
  } else if (reqPath.startsWith('/todos/')) {
    // /todos/:id: legacy tests expect X-User-Id when no keycloak config is active.
    try {
      userId = keycloakMode ? await getUserIdFromBearer() : xUserId || (await getUserIdFromBearer());
    } catch (e) {
      if (e.message === 'Server misconfigured') {
        return res.status(500).json({ error: 'Server misconfigured' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(keycloakMode ? 401 : 400).json({
        error: keycloakMode ? 'Authorization bearer token is required' : 'X-User-Id header is required',
      });
    }
  } else {
    // Fallback for any other route protected by this middleware.
    try {
      userId = await getUserIdFromBearer();
    } catch (e) {
      if (e.message === 'Server misconfigured') {
        return res.status(500).json({ error: 'Server misconfigured' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (!userId) {
      if (!xUserId || typeof xUserId !== 'string') {
        return res
          .status(401)
          .json({ error: 'Authorization bearer token is required' });
      }
      userId = xUserId;
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
  }

  req.userId = userId;

  try {
    await ensureUserExists(userId);
    next();
  } catch (error) {
    console.error('Error ensuring user exists:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { userMiddleware };
