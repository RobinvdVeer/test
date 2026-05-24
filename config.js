const PORT = process.env.PORT || 3000;
const AUTH_ISSUER = process.env.AUTH_ISSUER || 'http://localhost:8080/realms/local-dev';
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || 'todo-app';

module.exports = {
  port: PORT,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://todouser:todopass@localhost:5432/tododb',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  auth: {
    issuer: AUTH_ISSUER,
    publicIssuer: process.env.PUBLIC_AUTH_ISSUER || AUTH_ISSUER,
    clientId: AUTH_CLIENT_ID,
    audience: process.env.AUTH_AUDIENCE || AUTH_CLIENT_ID,
    jwksUri: process.env.AUTH_JWKS_URI,
    requiredRole: process.env.AUTH_REQUIRED_ROLE || 'user',
    rolesClaim: process.env.AUTH_ROLES_CLAIM || 'realm_access.roles',
    clientRolesClaim: process.env.AUTH_CLIENT_ROLES_CLAIM || `resource_access.${AUTH_CLIENT_ID}.roles`,
  },
};
