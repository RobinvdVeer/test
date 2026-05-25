const fs = require('fs');
const path = require('path');
const { getAuthEndpoints } = require('../auth/keycloak');
const { pageShell } = require('./pageShell');

function renderCallbackPage() {
  return pageShell({
    title: 'Signing in…',
    config: getAuthEndpoints(),
    scriptContent: fs.readFileSync(path.join(__dirname, '../../public/assets/callback.js'), 'utf8'),
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
