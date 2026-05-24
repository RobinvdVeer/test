function issuerEndpoint(issuer, path) {
  return `${issuer.replace(/\/$/, '')}${path}`;
}

function defaultMetadata(issuer) {
  return {
    issuer,
    authorization_endpoint: issuerEndpoint(issuer, '/protocol/openid-connect/auth'),
    token_endpoint: issuerEndpoint(issuer, '/protocol/openid-connect/token'),
    end_session_endpoint: issuerEndpoint(issuer, '/protocol/openid-connect/logout'),
    jwks_uri: issuerEndpoint(issuer, '/protocol/openid-connect/certs'),
  };
}

function withoutUndefinedValues(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

async function discoverOidcMetadata(issuer, overrides = {}) {
  const wellKnownUrl = issuerEndpoint(issuer, '/.well-known/openid-configuration');
  const definedOverrides = withoutUndefinedValues(overrides);

  try {
    const response = await fetch(wellKnownUrl);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed with status ${response.status}`);
    }

    return {
      ...defaultMetadata(issuer),
      ...(await response.json()),
      ...definedOverrides,
    };
  } catch (error) {
    console.warn(`OIDC discovery unavailable at ${wellKnownUrl}; using configured/default endpoints:`, error.message);
    return {
      ...defaultMetadata(issuer),
      ...definedOverrides,
    };
  }
}

module.exports = {
  discoverOidcMetadata,
  defaultMetadata,
};
