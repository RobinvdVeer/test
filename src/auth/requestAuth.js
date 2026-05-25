const jwt = require('jsonwebtoken');
const { getRouteAuthPolicy } = require('./authPolicy');
const {
  isBearerToken,
  isKeycloakConfigured,
  verifyKeycloakJwt,
} = require('./keycloak');

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

async function resolveBearerUserId(authHeader) {
  return isKeycloakConfigured()
    ? keycloakUserIdFromBearer(authHeader)
    : legacyUserIdFromBearer(authHeader);
}

async function resolveAuthenticatedUser({ authHeader, xUserId, reqPath }) {
  const keycloakMode = isKeycloakConfigured();
  const policy = getRouteAuthPolicy(reqPath, keycloakMode);

  try {
    const userId = await resolveBearerUserId(authHeader);

    if (userId && typeof userId === 'string') {
      return { userId };
    }

    if (policy.allowHeaderFallback && xUserId && typeof xUserId === 'string') {
      return { userId: xUserId };
    }

    return {
      error: policy.missingError,
      status: policy.missingStatus,
    };
  } catch (error) {
    if (error.message === 'Server misconfigured') {
      return { error: 'Server misconfigured', status: 500 };
    }

    return { error: 'Invalid token', status: 401 };
  }
}

module.exports = { resolveAuthenticatedUser };
