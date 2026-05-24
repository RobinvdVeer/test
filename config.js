const isProduction = process.env.NODE_ENV === 'production';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`${name} must be set in production`);
  }
  return value;
}

function requireHttpsInProduction(name, value) {
  if (isProduction && value && !value.startsWith('https://')) {
    throw new Error(`${name} must use HTTPS in production`);
  }
}

const PORT = process.env.PORT || 3000;
const AUTH_ISSUER = requiredEnv('AUTH_ISSUER') || 'http://localhost:8080/realms/local-dev';
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'todo-app';
const AUTH_AUDIENCE = requiredEnv('AUTH_AUDIENCE') || AUTH_CLIENT_ID;
const AUTH_JWKS_URI = requiredEnv('AUTH_JWKS_URI');
const DATABASE_URL = requiredEnv('DATABASE_URL') || 'postgresql://todouser:todopass@localhost:5432/tododb';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (isProduction ? '' : 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173');
const corsOrigins = CORS_ORIGIN
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && corsOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must be set in production');
}

requireHttpsInProduction('AUTH_ISSUER', AUTH_ISSUER);
requireHttpsInProduction('AUTH_JWKS_URI', AUTH_JWKS_URI);

module.exports = {
  port: PORT,
  isProduction,
  databaseUrl: DATABASE_URL,
  corsOrigin: CORS_ORIGIN,
  corsOrigins,
  protectMetrics: isProduction || process.env.METRICS_REQUIRE_AUTH === 'true',
  auth: {
    issuer: AUTH_ISSUER,
    publicIssuer: process.env.PUBLIC_AUTH_ISSUER || AUTH_ISSUER,
    clientId: AUTH_CLIENT_ID,
    audience: AUTH_AUDIENCE,
    jwksUri: AUTH_JWKS_URI,
    requiredRole: process.env.AUTH_REQUIRED_ROLE || 'user',
    rolesClaim: process.env.AUTH_ROLES_CLAIM || 'realm_access.roles',
    clientRolesClaim: process.env.AUTH_CLIENT_ROLES_CLAIM || `resource_access.${AUTH_CLIENT_ID}.roles`,
  },
};
