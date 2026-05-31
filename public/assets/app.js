import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';

// ── DOM references ──────────────────────────────────────────────
const statusEl = document.getElementById('status');
const todosList = document.getElementById('todos');
const form = document.getElementById('todo-form');
const logoutButton = document.getElementById('logout');
const btnAdd = document.getElementById('btn-add');
const btnCancel = document.getElementById('btn-cancel');
const searchInput = document.getElementById('search');

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
  statusEl.className = 'status-bar' + (type ? ' ' + type : '');
  statusEl.textContent = message;
}

function hideStatus() {
  if (!statusEl) return;
  statusEl.className = 'status-bar';
  statusEl.textContent = '';
}

// ── Form toggle ─────────────────────────────────────────────────
function showForm() {
  form.classList.add('visible');
  form.reset();
  form.elements['title'].focus();
}

function hideForm() {
  form.classList.remove('visible');
  form.reset();
}

// ── Badge label formatter ───────────────────────────────────────
function formatLabel(value) {
  if (!value) return '';
  return value.replace(/_/g, ' ');
}

// ── Badge rendering ───────────────────────────────────────────────
function renderBadges(todo) {
  const badges = [];

  if (todo.status) {
    const badge = document.createElement('span');
    const statusClass = todo.status === 'completed' ? 'completed' : todo.status === 'in_progress' ? 'in_progress' : 'pending';
    badge.className = 'badge badge--' + statusClass;
    badge.textContent = formatLabel(todo.status);
    badges.push(badge);
  }

  if (todo.priority) {
    const badge = document.createElement('span');
    badge.className = 'badge badge--priority-' + todo.priority.replace(/_/g, '-');
    badge.textContent = formatLabel(todo.priority);
    badges.push(badge);
  }

  if (todo.category) {
    const badge = document.createElement('span');
    badge.className = 'badge badge--category';
    badge.textContent = todo.category;
    badges.push(badge);
  }

  return badges;
}

// ── Title sub-routine ─────────────────────────────────────────────
function renderTitle(todo) {
  const titleEl = document.createElement('div');
  titleEl.className = 'todo-title';
  titleEl.textContent = todo.title;
  return titleEl;
}

// ── Meta (badges) sub-routine ─────────────────────────────────────
function renderMeta(todo) {
  const badges = renderBadges(todo);
  if (!badges.length) return null;

  const metaEl = document.createElement('div');
  metaEl.className = 'todo-meta';
  for (const b of badges) {
    metaEl.appendChild(b);
  }
  return metaEl;
}

// ── Description sub-routine ───────────────────────────────────────
function renderDescription(todo) {
  if (!todo.description) return null;
  const descEl = document.createElement('div');
  descEl.className = 'todo-description';
  descEl.textContent = todo.description;
  return descEl;
}

// ── Todo item renderer ──────────────────────────────────────────
function renderTodoItem(todo) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.todoId = todo.id;

  // Status class on the card itself
  if (todo.status) {
    li.classList.add('todo-item--' + todo.status);
  }
  if (todo.status === 'completed') {
    li.classList.add('completed');
  }

  const parts = [];
  parts.push(renderTitle(todo));

  const metaEl = renderMeta(todo);
  if (metaEl) {
    parts.push(metaEl);
  }

  const descEl = renderDescription(todo);
  if (descEl) {
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
  li.className = 'empty-state';
  li.innerHTML = '<span class="empty-state__icon">📋</span>No todos yet.<br>Click <strong>+ New todo</strong> to get started.';
  todosList.appendChild(li);
}

// ── Filtered list renderer ───────────────────────────────────────
const allTodos = [];

function renderTodos(todos) {
  allTodos.length = 0;
  for (const t of todos) {
    allTodos.push(t);
  }
  applyFilter();
}

function applyFilter() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  todosList.innerHTML = '';

  const filtered = query
    ? allTodos.filter((t) =>
        [t.title, t.description, t.category, t.status, t.priority]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(query))
      )
    : allTodos;

  if (!filtered.length) {
    renderEmptyState();
    return;
  }

  for (const todo of filtered) {
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
  hideForm();
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

btnAdd.addEventListener('click', showForm);
btnCancel.addEventListener('click', hideForm);

if (searchInput) {
  searchInput.addEventListener('input', () => {
    applyFilter();
  });
}

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
