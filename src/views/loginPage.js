const { getAuthEndpoints } = require('../auth/keycloak');
const { pageShell } = require('./pageShell');

function renderLoginPage() {
  return pageShell({
    title: 'Todo Login',
    config: getAuthEndpoints(),
    scriptSrc: '/assets/login.js',
    body: `
      <header>
        <div>
          <h1>Todo Login</h1>
          <p class="muted">Authenticate with Keycloak to manage your own todos.</p>
        </div>
        <a href="/app">Go to app</a>
      </header>

      <div class="card">
        <p id="status">Ready.</p>
        <button id="loginBtn">Sign in with Keycloak</button>
      </div>
    `,
  });
}

module.exports = { renderLoginPage };
