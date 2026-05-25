const { renderLoginPage } = require('../views/loginPage');
const { renderCallbackPage } = require('../views/callbackPage');
const { renderAppPage } = require('../views/appPage');

function registerFrontendRoutes(app) {
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();

    if (req.path === '/login') {
      return res.type('html').send(renderLoginPage());
    }

    if (req.path === '/auth/callback') {
      return res.type('html').send(renderCallbackPage());
    }

    if (req.path === '/app') {
      return res.type('html').send(renderAppPage());
    }

    return next();
  });
}

module.exports = { registerFrontendRoutes };
