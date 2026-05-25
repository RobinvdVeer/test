const { getAuthEndpoints } = require('../auth/keycloak');

function escapeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pageShell(title, body, configScript) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; padding: 2rem; max-width: 960px; }
      header { display: flex; gap: 1rem; align-items: center; justify-content: space-between; }
      button, input, textarea { font: inherit; }
      button { cursor: pointer; }
      .card { border: 1px solid #9996; border-radius: 12px; padding: 1rem; margin: 1rem 0; }
      .row { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .muted { opacity: .75; }
      ul { padding-left: 1.25rem; }
      li { margin: .5rem 0; }
      .todo { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
      .todo small { display: block; opacity: .75; }
      .status { font-weight: 600; }
      .error { color: #c33; }
      .success { color: #090; }
      a { color: inherit; }
    </style>
    <script>${configScript}</script>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function renderLoginPage() {
  const config = getAuthEndpoints();
  const configScript = `window.__AUTH_CONFIG__ = ${escapeForInlineScript(config)};`;

  return pageShell(
    'Todo Login',
    `
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

      <script>
        const config = window.__AUTH_CONFIG__;
        const status = document.getElementById('status');
        const loginBtn = document.getElementById('loginBtn');

        function randomString(length = 64) {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
          const bytes = new Uint8Array(length);
          crypto.getRandomValues(bytes);
          return Array.from(bytes, (value) => chars[value % chars.length]).join('');
        }

        function base64UrlEncode(bytes) {
          const binary = String.fromCharCode(...bytes);
          return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
        }

        async function sha256(value) {
          const data = new TextEncoder().encode(value);
          const hash = await crypto.subtle.digest('SHA-256', data);
          return base64UrlEncode(new Uint8Array(hash));
        }

        async function login() {
          if (!config.enabled) {
            status.textContent = 'Keycloak is not configured on this server.';
            status.className = 'error';
            return;
          }

          const verifier = randomString(96);
          const challenge = await sha256(verifier);
          const state = randomString(32);

          sessionStorage.setItem('todo_pkce_verifier', verifier);
          sessionStorage.setItem('todo_pkce_state', state);

          const url = new URL(config.authorizationEndpoint);
          url.searchParams.set('client_id', config.clientId);
          url.searchParams.set('redirect_uri', config.redirectUri);
          url.searchParams.set('response_type', 'code');
          url.searchParams.set('scope', config.scope);
          url.searchParams.set('state', state);
          url.searchParams.set('code_challenge', challenge);
          url.searchParams.set('code_challenge_method', 'S256');

          window.location.assign(url.toString());
        }

        loginBtn.addEventListener('click', () => login().catch((error) => {
          console.error(error);
          status.textContent = error.message || 'Login failed';
          status.className = 'error';
        }));
      </script>
    `,
    configScript
  );
}

function renderCallbackPage() {
  const config = getAuthEndpoints();
  const configScript = `window.__AUTH_CONFIG__ = ${escapeForInlineScript(config)};`;

  return pageShell(
    'Signing in…',
    `
      <main class="card">
        <h1>Signing in…</h1>
        <p id="status">Completing Keycloak login.</p>
      </main>

      <script>
        const config = window.__AUTH_CONFIG__;
        const status = document.getElementById('status');
        const params = new URLSearchParams(window.location.search);

        function fail(message) {
          status.textContent = message;
          status.className = 'error';
        }

        async function exchangeCode() {
          if (params.get('error')) {
            throw new Error(params.get('error_description') || params.get('error'));
          }

          const code = params.get('code');
          const state = params.get('state');
          const expectedState = sessionStorage.getItem('todo_pkce_state');
          const verifier = sessionStorage.getItem('todo_pkce_verifier');

          if (!code) throw new Error('Missing authorization code');
          if (!expectedState || expectedState !== state) throw new Error('Invalid login state');
          if (!verifier) throw new Error('Missing PKCE verifier');

          const response = await fetch(config.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              client_id: config.clientId,
              code,
              redirect_uri: config.redirectUri,
              code_verifier: verifier,
            }),
          });

          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error_description || payload.error || 'Token exchange failed');
          }

          const expiresIn = Number(payload.expires_in || 0);
          localStorage.setItem('todo_tokens', JSON.stringify({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
            id_token: payload.id_token,
            expires_at: Date.now() + (expiresIn * 1000),
          }));

          sessionStorage.removeItem('todo_pkce_state');
          sessionStorage.removeItem('todo_pkce_verifier');
          window.location.replace('/app');
        }

        exchangeCode().catch((error) => {
          console.error(error);
          fail(error.message || 'Login failed');
          sessionStorage.removeItem('todo_pkce_state');
          sessionStorage.removeItem('todo_pkce_verifier');
        });
      </script>
    `,
    configScript
  );
}

function renderAppPage() {
  const config = getAuthEndpoints();
  const configScript = `window.__AUTH_CONFIG__ = ${escapeForInlineScript(config)};`;

  return pageShell(
    'Todos',
    `
      <header>
        <div>
          <h1>Your todos</h1>
          <p class="muted">Only the authenticated user can see their own todos.</p>
        </div>
        <div>
          <a href="/login">Login</a>
          <button id="logoutBtn">Logout</button>
        </div>
      </header>

      <div class="card">
        <p id="whoami" class="muted">Loading session…</p>
        <p id="message"></p>
      </div>

      <div class="card">
        <h2>Create todo</h2>
        <form id="todoForm" class="row">
          <label>Title<br /><input name="title" required /></label>
          <label>Category<br /><input name="category" /></label>
          <label>Status<br />
            <select name="status">
              <option value="">Default</option>
              <option value="pending">pending</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
            </select>
          </label>
          <label>Priority<br />
            <select name="priority">
              <option value="">Default</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label style="grid-column: 1 / -1;">Description<br /><textarea name="description" rows="3"></textarea></label>
          <button type="submit">Add todo</button>
        </form>
      </div>

      <div class="card">
        <h2>Todos</h2>
        <button id="reloadBtn">Reload</button>
        <ul id="todoList"></ul>
      </div>

      <script>
        const config = window.__AUTH_CONFIG__;
        const whoami = document.getElementById('whoami');
        const message = document.getElementById('message');
        const todoList = document.getElementById('todoList');
        const reloadBtn = document.getElementById('reloadBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const form = document.getElementById('todoForm');

        function decodePayload(token) {
          const payload = token.split('.')[1];
          return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        }

        function getTokens() {
          const raw = localStorage.getItem('todo_tokens');
          return raw ? JSON.parse(raw) : null;
        }

        async function refreshTokenIfNeeded() {
          const tokens = getTokens();
          if (!tokens?.access_token) {
            window.location.replace('/login');
            throw new Error('Not authenticated');
          }

          if (!tokens.refresh_token) return tokens.access_token;
          if (tokens.expires_at && tokens.expires_at > Date.now() + 30_000) return tokens.access_token;

          const response = await fetch(config.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: config.clientId,
              refresh_token: tokens.refresh_token,
            }),
          });

          const payload = await response.json();
          if (!response.ok) {
            localStorage.removeItem('todo_tokens');
            window.location.replace('/login');
            throw new Error(payload.error_description || payload.error || 'Token refresh failed');
          }

          localStorage.setItem('todo_tokens', JSON.stringify({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token || tokens.refresh_token,
            id_token: payload.id_token || tokens.id_token,
            expires_at: Date.now() + (Number(payload.expires_in || 0) * 1000),
          }));

          return payload.access_token;
        }

        async function apiFetch(path, options = {}) {
          const token = await refreshTokenIfNeeded();
          const response = await fetch(path, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...(options.headers || {}),
              Authorization: 'Bearer ' + token,
            },
          });

          if (response.status === 401) {
            localStorage.removeItem('todo_tokens');
            window.location.replace('/login');
          }

          return response;
        }

        function renderTodos(items) {
          todoList.innerHTML = '';
          if (!items.length) {
            todoList.innerHTML = '<li class="muted">No todos yet.</li>';
            return;
          }

          for (const item of items) {
            const li = document.createElement('li');
            li.className = 'card todo';
            li.innerHTML =
              '<div>' +
                '<strong>' + item.title + '</strong>' +
                '<small>id ' + item.id + ' · ' + (item.category || 'uncategorized') + ' · ' + item.priority + '</small>' +
                '<small class="status">' + item.status + '</small>' +
                '<small>' + (item.description || '') + '</small>' +
              '</div>' +
              '<div>' +
                '<button data-delete="' + item.id + '">Delete</button>' +
              '</div>';
            todoList.appendChild(li);
          }
        }

        async function loadTodos() {
          message.textContent = 'Loading todos…';
          const response = await apiFetch('/todos');
          const items = await response.json();
          if (!response.ok) throw new Error(items.error || 'Unable to load todos');
          renderTodos(items);
          message.textContent = 'Loaded ' + items.length + ' todo(s).';
          message.className = 'success';
        }

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const body = Object.fromEntries(formData.entries());
          for (const key of Object.keys(body)) {
            if (body[key] === '') delete body[key];
          }

          const response = await apiFetch('/todos', {
            method: 'POST',
            body: JSON.stringify(body),
          });
          const payload = await response.json();
          if (!response.ok) {
            message.textContent = payload.error || 'Unable to create todo';
            message.className = 'error';
            return;
          }

          form.reset();
          await loadTodos();
        });

        todoList.addEventListener('click', async (event) => {
          const id = event.target?.dataset?.delete;
          if (!id) return;

          const response = await apiFetch('/todos/' + id, { method: 'DELETE' });
          const payload = await response.json();
          if (!response.ok) {
            message.textContent = payload.error || 'Unable to delete todo';
            message.className = 'error';
            return;
          }

          await loadTodos();
        });

        reloadBtn.addEventListener('click', () => loadTodos().catch((error) => {
          console.error(error);
          message.textContent = error.message;
          message.className = 'error';
        }));

        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('todo_tokens');
          window.location.assign('/login');
        });

        const session = getTokens();
        if (!session?.access_token) {
          window.location.replace('/login');
        } else {
          try {
            const payload = decodePayload(session.access_token);
            whoami.textContent = 'Signed in as ' + payload.sub;
          } catch (_) {
            whoami.textContent = 'Signed in';
          }
          loadTodos().catch((error) => {
            console.error(error);
            message.textContent = error.message;
            message.className = 'error';
          });
        }
      </script>
    `,
    configScript
  );
}

function registerFrontendRoutes(app) {
  app.get('/', (_req, res) => res.redirect('/app'));
  app.get('/login', (_req, res) => res.type('html').send(renderLoginPage()));
  app.get('/auth/callback', (_req, res) => res.type('html').send(renderCallbackPage()));
  app.get('/app', (_req, res) => res.type('html').send(renderAppPage()));
  app.get('/auth/config', (_req, res) => res.json(getAuthEndpoints()));
}

module.exports = { registerFrontendRoutes };
