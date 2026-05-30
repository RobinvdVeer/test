function buildUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

function getConfig() {
  const keycloakRealm = process.env.KEYCLOAK_REALM || 'todos';
  const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || 'todo-app';
  const issuerUrl = process.env.KEYCLOAK_ISSUER_URL || 'http://localhost:8081/realms/todos';
  const jwksUrl = process.env.KEYCLOAK_JWKS_URL || 'http://keycloak:8080/realms/todos/protocol/openid-connect/certs';
  const authorizeUrl = process.env.KEYCLOAK_AUTHORIZE_URL || buildUrl(issuerUrl, 'protocol/openid-connect/auth');
  const tokenUrl = process.env.KEYCLOAK_TOKEN_URL || buildUrl(issuerUrl, 'protocol/openid-connect/token');
  const logoutUrl = process.env.KEYCLOAK_LOGOUT_URL || buildUrl(issuerUrl, 'protocol/openid-connect/logout');

  // Email configuration for notification scheduler
  const emailConfig = {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM,
    secure: process.env.EMAIL_SECURE === 'true',
    tlsRejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== 'false',
  };

  // Notification scheduler configuration
  const notificationConfig = {
    enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
    lookAheadDays: process.env.NOTIFICATIONS_LOOK_AHEAD_DAYS
      ? Number(process.env.NOTIFICATIONS_LOOK_AHEAD_DAYS)
      : 2,
    intervalMs: process.env.NOTIFICATIONS_INTERVAL_MS
      ? Number(process.env.NOTIFICATIONS_INTERVAL_MS)
      : 0,
    minDaysSinceLastEmail: process.env.NOTIFICATIONS_MIN_DAYS_SINCE_LAST_EMAIL
      ? Number(process.env.NOTIFICATIONS_MIN_DAYS_SINCE_LAST_EMAIL)
      : 0,
  };

  return {
    PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV || 'development',
    auth: {
      realm: keycloakRealm,
      clientId: keycloakClientId,
      issuerUrl,
      jwksUrl,
      authorizeUrl,
      tokenUrl,
      logoutUrl,
      redirectUri: process.env.AUTH_REDIRECT_URI || 'http://localhost:3000/auth/callback',
      postLogoutRedirectUri: process.env.AUTH_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000/login',
      scope: process.env.AUTH_SCOPE || 'openid profile email',
    },
    email: emailConfig,
    notifications: notificationConfig,
  };
}

module.exports = { getConfig };
