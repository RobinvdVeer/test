import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';

// ── DOM references ──────────────────────────────────────────────
const statusEl = document.getElementById('status');
const todosList = document.getElementById('todos');
const form = document.getElementById('todo-form');
const logoutButton = document.getElementById('logout');

// ── HTML escaping ───────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ── Status bar helpers ──────────────────────────────────────────
function showStatus(message, type) {
  if (!statusEl) return;
  statusEl.className = type || '';
  statusEl.textContent = message;
}

function hideStatus() {
  if (!statusEl) return;
  statusEl.className = '';
  statusEl.textContent = '';
}

// ── Loading indicator helper ────────────────────────────────────
function toggleLoading(element, isLoading) {
  if (!element) return;
  if (isLoading) {
    element.dataset.loading = 'true';
    element.style.opacity = '0.5';
    element.style.pointerEvents = 'none';
  } else {
    delete element.dataset.loading;
    element.style.opacity = '';
    element.style.pointerEvents = '';
  }
}

// ── Todo item renderer ──────────────────────────────────────────
function renderTodoItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.todoId = todo.id;

  const parts = [];

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'todo-title';
  titleEl.textContent = todo.title;
  parts.push(titleEl);

  // Meta row: status · priority · category
  const metaParts = [escapeHtml(todo.status), escapeHtml(todo.priority)];
  if (todo.category) {
    metaParts.push(escapeHtml(todo.category));
  }
  const metaEl = document.createElement('div');
  metaEl.className = 'todo-meta';
  metaEl.textContent = metaParts.join(' · ');
  parts.push(metaEl);

  // Description (optional)
  if (todo.description) {
    const descEl = document.createElement('div');
    descEl.className = 'todo-description';
    descEl.textContent = todo.description;
    parts.push(descEl);
  }

  for (const part of parts) {
    li.appendChild(part);
  }

  return li;
}

// ── Empty state ─────────────────────────────────────────────────
function renderEmptyState() {
  todosList.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'muted';
  li.textContent = 'No todos yet.';
  todosList.appendChild(li);
}

// ── Full list renderer ──────────────────────────────────────────
function renderTodos(todos) {
  todosList.innerHTML = '';
  if (!todos.length) {
    renderEmptyState();
    return;
  }

  for (const todo of todos) {
    todosList.appendChild(renderTodoItem(todo));
  }
}

// ── Auth helpers ────────────────────────────────────────────────
function getAuthHeaders() {
  const auth = getStoredAuth();
  return { Authorization: `Bearer ${auth.access_token}` };
}

function requireAuth() {
  const auth = getStoredAuth();
  if (!isTokenValid(auth)) {
    clearStoredAuth();
    window.location.replace(
      `/login?returnTo=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`
    );
    throw new Error('Authentication required');
  }
  return auth;
}

// ── API calls ───────────────────────────────────────────────────
async function loadTodos() {
  const response = await fetch('/todos', { headers: getAuthHeaders() });
  if (response.status === 401) {
    clearStoredAuth();
    window.location.replace('/login');
    return;
  }
  if (!response.ok) throw new Error(`Unable to load todos (${response.status})`);
  renderTodos(await response.json());
}

async function createTodo(event) {
  event.preventDefault();
  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value || undefined,
    category: document.getElementById('category').value || undefined,
    status: document.getElementById('status-input').value || undefined,
    priority: document.getElementById('priority').value || undefined,
  };

  const response = await fetch('/todos', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Unable to create todo (${response.status})`);
  form.reset();
  await loadTodos();
}

// ── Event listeners ─────────────────────────────────────────────
form.addEventListener('submit', (event) => {
  createTodo(event).catch((err) => {
    showStatus(err.message || 'Failed to create todo', 'error');
  });
});

logoutButton.addEventListener('click', () => {
  logout();
  window.location.replace('/login');
});

// ── Boot ────────────────────────────────────────────────────────
(async () => {
  try {
    requireAuth();
    showStatus('Signed in.', 'success');
    await loadTodos();
  } catch (err) {
    showStatus(err.message || 'Failed to load app', 'error');
  }
})();
