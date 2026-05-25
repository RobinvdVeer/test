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
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
