function getRouteAuthPolicy(reqPath, keycloakMode) {
  if (reqPath === '/todos' || reqPath === '/todos/') {
    return keycloakMode
      ? { preferBearer: true, allowHeaderFallback: false, missingStatus: 401, missingError: 'Authorization bearer token is required' }
      : { preferBearer: true, allowHeaderFallback: true, missingStatus: 401, missingError: 'Authorization bearer token is required' };
  }

  if (reqPath === '/metrics' || reqPath.startsWith('/todos/')) {
    return keycloakMode
      ? { preferBearer: true, allowHeaderFallback: false, missingStatus: 401, missingError: 'Authorization bearer token is required' }
      : { preferBearer: false, allowHeaderFallback: true, missingStatus: 400, missingError: 'X-User-Id header is required' };
  }

  return {
    preferBearer: true,
    allowHeaderFallback: true,
    missingStatus: 401,
    missingError: 'Authorization bearer token is required',
  };
}

module.exports = { getRouteAuthPolicy };
