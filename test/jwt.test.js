const crypto = require('crypto');

const originalFetch = global.fetch;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function setupKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const jwk = publicKey.export({ format: 'jwk' });
  const jwks = {
    keys: [
      {
        ...jwk,
        kid: 'test-key',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };

  return { privateKey, jwks };
}

function signToken(privateKey, { header = {}, payload = {} } = {}) {
  const fullHeader = {
    alg: 'RS256',
    kid: 'test-key',
    typ: 'JWT',
    ...header,
  };
  const fullPayload = {
    iss: 'https://issuer.example/realms/todos',
    sub: 'user-1',
    aud: 'todo-app',
    azp: 'todo-app',
    iat: 1704067200,
    exp: 1704070800,
    ...payload,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(fullHeader));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function loadJwtModule() {
  jest.resetModules();
  return require('../src/auth/jwt');
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('verifyJwt', () => {
  test('accepts a valid token and returns the payload', async () => {
    const { privateKey, jwks } = setupKeyPair();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => jwks }));
    const { verifyJwt } = await loadJwtModule();

    const token = signToken(privateKey);
    const payload = await verifyJwt(token, {
      issuer: 'https://issuer.example/realms/todos',
      jwksUrl: 'https://issuer.example/certs',
      clientId: 'todo-app',
    });

    expect(payload.sub).toBe('user-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['missing token', undefined, 'Missing token'],
    ['malformed token', 'abc.def', 'Malformed token'],
    ['unsupported alg', signToken(setupKeyPair().privateKey, { header: { alg: 'HS256' } }), 'Unsupported token algorithm'],
    ['wrong issuer', signToken(setupKeyPair().privateKey, { payload: { iss: 'https://other.example' } }), 'Invalid token issuer'],
    ['expired token', signToken(setupKeyPair().privateKey, { payload: { exp: 1704067100 } }), 'Token expired'],
    ['not-yet-valid token', signToken(setupKeyPair().privateKey, { payload: { nbf: 1704067300 } }), 'Token not yet valid'],
    ['wrong audience', signToken(setupKeyPair().privateKey, { payload: { aud: 'other-app', azp: 'other-app' } }), 'Invalid token audience'],
    ['missing kid', signToken(setupKeyPair().privateKey, { header: { kid: undefined } }), 'Missing token key id'],
  ])('rejects %s before fetching JWKS', async (_label, token, message) => {
    global.fetch = jest.fn();
    const { verifyJwt } = await loadJwtModule();

    await expect(
      verifyJwt(token, {
        issuer: 'https://issuer.example/realms/todos',
        jwksUrl: 'https://issuer.example/certs',
        clientId: 'todo-app',
      })
    ).rejects.toThrow(message);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects when the JWKS endpoint returns an error', async () => {
    const { privateKey } = setupKeyPair();
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));
    const { verifyJwt } = await loadJwtModule();

    await expect(
      verifyJwt(signToken(privateKey), {
        issuer: 'https://issuer.example/realms/todos',
        jwksUrl: 'https://issuer.example/certs',
        clientId: 'todo-app',
      })
    ).rejects.toThrow('Failed to fetch JWKS: 503');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects when the JWKS does not contain the signing key', async () => {
    const { privateKey } = setupKeyPair();
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ keys: [] }),
    }));
    const { verifyJwt } = await loadJwtModule();

    await expect(
      verifyJwt(signToken(privateKey), {
        issuer: 'https://issuer.example/realms/todos',
        jwksUrl: 'https://issuer.example/certs',
        clientId: 'todo-app',
      })
    ).rejects.toThrow('Signing key not found');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects an invalid signature', async () => {
    const { privateKey, jwks } = setupKeyPair();
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => jwks }));
    const { verifyJwt } = await loadJwtModule();

    const token = `${signToken(privateKey).slice(0, -1)}x`;

    await expect(
      verifyJwt(token, {
        issuer: 'https://issuer.example/realms/todos',
        jwksUrl: 'https://issuer.example/certs',
        clientId: 'todo-app',
      })
    ).rejects.toThrow('Invalid token signature');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
