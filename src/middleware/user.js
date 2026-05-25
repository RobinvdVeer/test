const { getConfig } = require('../config');
const { verifyJwt } = require('../auth/jwt');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization bearer token is required' });
  }

  const token = authHeader.slice('Bearer '.length);
  const config = getConfig();

  let payload;
  try {
    payload = await verifyJwt(token, {
      issuer: config.auth.issuerUrl,
      jwksUrl: config.auth.jwksUrl,
      clientId: config.auth.clientId,
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid bearer token' });
  }

  if (!payload?.sub || typeof payload.sub !== 'string') {
    return res.status(401).json({ error: 'Invalid token payload' });
  }

  req.userId = payload.sub;
  next();
}

module.exports = {
  authMiddleware,
  userMiddleware: authMiddleware,
};
