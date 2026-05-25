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
