const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

function getClaim(decoded, path, context = {}) {
  if (!path) return undefined;

  return path
    .replaceAll('${clientId}', context.clientId || '')
    .split('.')
    .filter(Boolean)
    .reduce((value, segment) => (value == null ? undefined : value[segment]), decoded);
}

function normalizeRoles(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function tokenRoles(decoded, authConfig) {
  return [
    ...normalizeRoles(getClaim(decoded, authConfig.rolesClaim, authConfig)),
    ...normalizeRoles(getClaim(decoded, authConfig.clientRolesClaim, authConfig)),
  ];
}

function createAuthenticateJwt({ authConfig, jwksUri }) {
  const jwks = jwksClient({
    jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 10 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });

  function getSigningKey(header, callback) {
    jwks.getSigningKey(header.kid, (error, key) => {
      if (error) return callback(error);
      callback(null, key.getPublicKey());
    });
  }

  return function authenticateJwt(req, res, next) {
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
        issuer: authConfig.issuer,
        audience: authConfig.audience,
      },
      (error, decoded) => {
        if (error) {
          return res.status(401).json({ error: 'Invalid or expired bearer token' });
        }

        if (authConfig.requiredRole && !tokenRoles(decoded, authConfig).includes(authConfig.requiredRole)) {
          return res.status(403).json({ error: `Required role '${authConfig.requiredRole}' is missing` });
        }

        req.auth = decoded;
        req.userId = decoded.sub;
        next();
      }
    );
  };
}

module.exports = {
  createAuthenticateJwt,
  tokenRoles,
};
