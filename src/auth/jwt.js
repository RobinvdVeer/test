const crypto = require('crypto');

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const jwksCache = new Map();

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeJson(segment) {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

async function fetchJwks(jwksUrl) {
  const cached = jwksCache.get(jwksUrl);
  const now = Date.now();
  if (cached && now - cached.cachedAt < JWKS_CACHE_TTL_MS) {
    return cached.jwks;
  }

  const response = await fetch(jwksUrl, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = await response.json();
  jwksCache.set(jwksUrl, { jwks, cachedAt: now });
  return jwks;
}

function normalizeAudience(payloadAud) {
  if (!payloadAud) return [];
  return Array.isArray(payloadAud) ? payloadAud : [payloadAud];
}

function verifySignature(token, jwk) {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return verifier.verify(
    publicKey,
    Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  );
}

async function verifyJwt(token, { issuer, jwksUrl, clientId }) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  const [encodedHeader, encodedPayload] = parts;
  const header = base64UrlDecodeJson(encodedHeader);
  const payload = base64UrlDecodeJson(encodedPayload);

  if (header.alg !== 'RS256') {
    throw new Error('Unsupported token algorithm');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid token payload');
  }

  if (issuer && payload.iss !== issuer) {
    throw new Error('Invalid token issuer');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('Token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now) {
    throw new Error('Token not yet valid');
  }

  if (clientId) {
    const aud = normalizeAudience(payload.aud);
    const audienceMatches = aud.includes(clientId) || payload.azp === clientId;
    if (!audienceMatches) {
      throw new Error('Invalid token audience');
    }
  }

  if (!header.kid) {
    throw new Error('Missing token key id');
  }

  const jwks = await fetchJwks(jwksUrl);
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    throw new Error('Signing key not found');
  }

  if (!verifySignature(token, key)) {
    throw new Error('Invalid token signature');
  }

  return payload;
}

module.exports = {
  base64UrlEncode,
  verifyJwt,
};
