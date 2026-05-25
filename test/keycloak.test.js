const crypto = require('crypto');

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt({ privateKey, header, payload }) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function makeKeyPair(kid = 'kid-1') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  return { privateKey, jwk };
}

function loadModule() {
  jest.resetModules();
  return require('../src/auth/keycloak');
}

function setKeycloakEnv({ issuer = 'http://keycloak.local/realms/todos', jwksUrl = 'http://keycloak.local/jwks', clientId = 'todo-frontend' } = {}) {
  process.env.KEYCLOAK_ISSUER = issuer;
  process.env.KEYCLOAK_JWKS_URL = jwksUrl;
  process.env.KEYCLOAK_CLIENT_ID = clientId;
}

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.KEYCLOAK_ISSUER;
  delete process.env.KEYCLOAK_JWKS_URL;
  delete process.env.KEYCLOAK_CLIENT_ID;
});

describe('verifyKeycloakJwt', () => {
  test('verifies a valid token and reuses the JWKS cache on repeat verification', async () => {
    setKeycloakEnv();
    const { verifyKeycloakJwt } = loadModule();
    const { privateKey, jwk } = makeKeyPair('kid-1');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    });

    const token = signJwt({
      privateKey,
      header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
      payload: { iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 },
    });

    await expect(verifyKeycloakJwt(token)).resolves.toMatchObject({ sub: 'user-1' });
    await expect(verifyKeycloakJwt(token)).resolves.toMatchObject({ sub: 'user-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('rejects an unsupported token algorithm without fetching JWKS', async () => {
    setKeycloakEnv();
    const { verifyKeycloakJwt } = loadModule();
    const fetchMock = jest.spyOn(global, 'fetch');
    const token = `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'kid-1' }))}.${base64Url(JSON.stringify({ iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1' }))}.sig`;

    await expect(verifyKeycloakJwt(token)).rejects.toThrow('Unsupported token algorithm');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['JWKS fetch failure', async () => ({ ok: false, status: 500 }) , 'Unable to fetch JWKS: 500'],
    ['unknown kid', async () => ({ ok: true, json: async () => ({ keys: [makeKeyPair('other-kid').jwk] }) }), 'Unknown token key'],
    ['invalid signature', async () => {
      const good = makeKeyPair('kid-1');
      const bad = makeKeyPair('kid-1');
      return {
        ok: true,
        json: async () => ({ keys: [good.jwk] }),
        token: signJwt({
          privateKey: bad.privateKey,
          header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
          payload: { iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 },
        }),
      };
    }, 'Invalid token signature'],
    ['expired token', async () => {
      const { privateKey, jwk } = makeKeyPair('kid-1');
      return {
        ok: true,
        json: async () => ({ keys: [jwk] }),
        token: signJwt({
          privateKey,
          header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
          payload: { iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1', exp: Math.floor(Date.now() / 1000) - 60 },
        }),
      };
    }, 'Token expired'],
    ['not-yet-valid token', async () => {
      const { privateKey, jwk } = makeKeyPair('kid-1');
      return {
        ok: true,
        json: async () => ({ keys: [jwk] }),
        token: signJwt({
          privateKey,
          header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
          payload: { iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1', nbf: Math.floor(Date.now() / 1000) + 60 },
        }),
      };
    }, 'Token not yet valid'],
    ['issuer mismatch', async () => {
      const { privateKey, jwk } = makeKeyPair('kid-1');
      return {
        ok: true,
        json: async () => ({ keys: [jwk] }),
        token: signJwt({
          privateKey,
          header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
          payload: { iss: 'http://wrong-issuer', sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 },
        }),
      };
    }, 'Invalid token issuer'],
    ['missing subject', async () => {
      const { privateKey, jwk } = makeKeyPair('kid-1');
      return {
        ok: true,
        json: async () => ({ keys: [jwk] }),
        token: signJwt({
          privateKey,
          header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
          payload: { iss: process.env.KEYCLOAK_ISSUER, exp: Math.floor(Date.now() / 1000) + 60 },
        }),
      };
    }, 'Invalid token subject'],
  ])('%s', async (_label, setup, expectedMessage) => {
    setKeycloakEnv();
    const mod = loadModule();
    const fetchResult = await setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(fetchResult);
    const token = fetchResult.token || signJwt({
      privateKey: makeKeyPair('kid-1').privateKey,
      header: { alg: 'RS256', typ: 'JWT', kid: 'kid-1' },
      payload: { iss: process.env.KEYCLOAK_ISSUER, sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 },
    });

    await expect(mod.verifyKeycloakJwt(token)).rejects.toThrow(expectedMessage);
    expect(fetchMock).toHaveBeenCalled();
  });
});
