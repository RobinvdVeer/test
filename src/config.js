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
  const dailyReminderSendUrl = process.env.DAILY_REMINDER_EMAIL_SEND_URL || '';
  const dailyReminderFrom = process.env.DAILY_REMINDER_EMAIL_FROM || '';
  const dailyReminderRunAt = process.env.DAILY_REMINDER_RUN_AT || '08:00';
  const dailyReminderLookaheadDays = Number.parseInt(process.env.DAILY_REMINDER_LOOKAHEAD_DAYS || '3', 10);

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
    reminders: {
      enabled: Boolean(dailyReminderSendUrl && dailyReminderFrom),
      sendUrl: dailyReminderSendUrl || null,
      from: dailyReminderFrom || null,
      apiKey: process.env.DAILY_REMINDER_EMAIL_API_KEY || null,
      runAtUtc: dailyReminderRunAt,
      lookaheadDays: Number.isSafeInteger(dailyReminderLookaheadDays) && dailyReminderLookaheadDays >= 0 ? dailyReminderLookaheadDays : 3,
      appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    },
  };
}

module.exports = { getConfig };
