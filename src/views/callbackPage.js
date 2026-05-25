const { getAuthEndpoints } = require('../auth/keycloak');
const { pageShell } = require('./pageShell');

function renderCallbackPage() {
  return pageShell({
    title: 'Signing in…',
    config: getAuthEndpoints(),
    scriptSrc: '/assets/callback.js',
    body: `
      <main class="card">
        <h1>Signing in…</h1>
        <p id="status">Completing Keycloak login.</p>
      </main>
    `,
  });
}

module.exports = { renderCallbackPage };
