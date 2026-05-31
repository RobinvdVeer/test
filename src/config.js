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

  const emailConfig = {
    host: process.env.EMAIL_HOST || 'localhost',
    port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
    user: process.env.EMAIL_USER || undefined,
    pass: process.env.EMAIL_PASS || undefined,
    from: process.env.EMAIL_FROM || 'noreply@localhost',
    secure: process.env.EMAIL_SECURE === 'true',
  };

  const reminderConfig = {
    checkIntervalMinutes:
      process.env.REMINDER_CHECK_INTERVAL_MINUTES
        ? Number(process.env.REMINDER_CHECK_INTERVAL_MINUTES)
        : 60,
    dueSoonHours:
      process.env.REMINDER_DUE_SOON_HOURS
        ? Number(process.env.REMINDER_DUE_SOON_HOURS)
        : 48,
    minIntervalMinutes:
      process.env.REMINDER_MIN_INTERVAL_MINUTES
        ? Number(process.env.REMINDER_MIN_INTERVAL_MINUTES)
        : 1440,
  };

  return {
    PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV || 'development',
    email: emailConfig,
    reminder: reminderConfig,
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
  };
}

module.exports = { getConfig };
