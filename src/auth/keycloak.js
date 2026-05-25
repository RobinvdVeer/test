const crypto = require('crypto');

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map(); // jwksUrl -> { fetchedAtMs, keysByKid }

function trimTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/$/, '') : value;
}

function getKeycloakConfig() {
  const issuer = trimTrailingSlash(process.env.KEYCLOAK_ISSUER);
  const jwksUrl = process.env.KEYCLOAK_JWKS_URL;
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'todo-frontend';
  const appBaseUrl = trimTrailingSlash(process.env.APP_BASE_URL || 'http://localhost:3000');

  return {
    enabled: Boolean(issuer && jwksUrl),
    issuer,
    jwksUrl,
    clientId,
    appBaseUrl,
    redirectUri: `${appBaseUrl}/auth/callback`,
    postLogoutRedirectUri: `${appBaseUrl}/login`,
    scope: 'openid profile email',
  };
}

function validateKeycloakConfig() {
  const config = getKeycloakConfig();
  if (process.env.NODE_ENV === 'production' && !config.enabled) {
    throw new Error('Keycloak configuration is required in production');
  }

  return config;
}

function getAuthEndpoints() {
  const config = validateKeycloakConfig();

  if (!config.enabled) return { ...config };

  return {
    ...config,
    authorizationEndpoint: `${config.issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${config.issuer}/protocol/openid-connect/token`,
    logoutEndpoint: `${config.issuer}/protocol/openid-connect/logout`,
    wellKnownEndpoint: `${config.issuer}/.well-known/openid-configuration`,
  };
}

function base64UrlDecodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function getSigningInput(token) {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error('Invalid token');
  }

  return { headerPart, payloadPart, signaturePart };
}

async function getJwks(jwksUrl) {
  const cached = jwksCache.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAtMs < JWKS_CACHE_TTL_MS) {
    return cached.keysByKid;
  }

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch JWKS: ${response.status}`);
  }

  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const keysByKid = new Map();

  for (const jwk of keys) {
    if (jwk?.kid) keysByKid.set(jwk.kid, jwk);
  }

  jwksCache.set(jwksUrl, {
    fetchedAtMs: Date.now(),
    keysByKid,
  });

  return keysByKid;
}

async function verifyKeycloakJwt(token) {
  const config = getKeycloakConfig();
  if (!config.enabled) {
    throw new Error('Keycloak is not configured');
  }

  const { headerPart, payloadPart, signaturePart } = getSigningInput(token);
  const header = base64UrlDecodeJson(headerPart);
  if (header.alg !== 'RS256') {
    throw new Error('Unsupported token algorithm');
  }

  const keysByKid = await getJwks(config.jwksUrl);
  const jwk = keysByKid.get(header.kid);
  if (!jwk) {
    throw new Error('Unknown token key');
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();

  const signature = Buffer.from(signaturePart, 'base64url');
  if (!verifier.verify(publicKey, signature)) {
    throw new Error('Invalid token signature');
  }

  const payload = base64UrlDecodeJson(payloadPart);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (payload.iss !== config.issuer) {
    throw new Error('Invalid token issuer');
  }

  if (typeof payload.exp === 'number' && nowSeconds >= payload.exp) {
    throw new Error('Token expired');
  }

  if (typeof payload.nbf === 'number' && nowSeconds < payload.nbf) {
    throw new Error('Token not yet valid');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('Invalid token subject');
  }

  return payload;
}

function isKeycloakConfigured() {
  return validateKeycloakConfig().enabled;
}

function isBearerToken(value) {
  return typeof value === 'string' && value.startsWith('Bearer ');
}

module.exports = {
  getAuthEndpoints,
  getKeycloakConfig,
  isBearerToken,
  isKeycloakConfigured,
  validateKeycloakConfig,
  verifyKeycloakJwt,
};
