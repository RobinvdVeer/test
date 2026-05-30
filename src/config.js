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
    todo: {
      dueAlertDays: Number(process.env.TODO_DUE_ALERT_DAYS) || 2,
      defaultFrequencyHours: Number(process.env.EMAIL_DEFAULT_FREQUENCY_HOURS) || 24,
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
      fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
      emailCheckInterval: process.env.EMAIL_CHECK_INTERVAL ? Number(process.env.EMAIL_CHECK_INTERVAL) : 60 * 60 * 1000,
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  };
}

module.exports = { getConfig };
