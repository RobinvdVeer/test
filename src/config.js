function buildUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

function parseEmailFrequency(frequency) {
  const ms = parseTimeToMs(frequency);
  if (!ms || ms <= 0) {
    return null;
  }
  return ms;
}

function parseTimeToMs(value) {
  const match = /^\s*(\d+)\s*(milliseconds?|ms|seconds?|s|minutes?|m|hours?|h|days?|d|weeks?|w)\s*$/i.exec(value);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  if (isNaN(amount) || amount < 0) return null;

  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'ms':
    case 'millisecond':
    case 'milliseconds':
      return amount;
    case 'second':
    case 'seconds':
    case 's':
      return amount * 1000;
    case 'minute':
    case 'minutes':
    case 'm':
      return amount * 60 * 1000;
    case 'hour':
    case 'hours':
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'day':
    case 'days':
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    case 'week':
    case 'weeks':
    case 'w':
      return amount * 7 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
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
    email: {
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === 'true' : null,
      sender: process.env.SMTP_SENDER || null,
    },
    emailFrequency: process.env.EMAIL_FREQUENCY || '1 day',
  };
}

module.exports = { getConfig, parseEmailFrequency, parseTimeToMs };
