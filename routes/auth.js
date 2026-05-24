const express = require('express');

function createAuthRouter({ authConfig, publicMetadata }) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      issuer: publicMetadata.issuer || authConfig.publicIssuer,
      clientId: authConfig.clientId,
      audience: authConfig.audience,
      authorizationEndpoint: publicMetadata.authorization_endpoint,
      tokenEndpoint: publicMetadata.token_endpoint,
      logoutEndpoint: publicMetadata.end_session_endpoint,
      pkceMethod: 'S256',
    });
  });

  return router;
}

module.exports = createAuthRouter;
