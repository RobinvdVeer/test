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
