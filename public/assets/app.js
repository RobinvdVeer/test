import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';

const status = document.getElementById('status');
const todosList = document.getElementById('todos');
const form = document.getElementById('todo-form');
const logoutButton = document.getElementById('logout');


function getAuthHeaders() {
  const auth = getStoredAuth();
  return { Authorization: `Bearer ${auth.access_token}` };
}

function requireAuth() {
  const auth = getStoredAuth();
  if (!isTokenValid(auth)) {
    clearStoredAuth();
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error('Authentication required');
  }
  return auth;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function renderTodos(todos) {
  todosList.innerHTML = '';
  if (!todos.length) {
    todosList.innerHTML = '<li class="muted">No todos yet.</li>';
    return;
  }

  for (const todo of todos) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      <div class="todo-meta">${escapeHtml(todo.status)} · ${escapeHtml(todo.priority)}${todo.category ? ` · ${escapeHtml(todo.category)}` : ''}${todo.due_at ? ` · due ${escapeHtml(formatDateTime(todo.due_at))}` : ''}</div>
      <div>${escapeHtml(todo.description || '')}</div>
    `;
    todosList.appendChild(li);
  }
}

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
  const dueAtInput = document.getElementById('due_at').value;
  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value || undefined,
    category: document.getElementById('category').value || undefined,
    status: document.getElementById('status-input').value || undefined,
    priority: document.getElementById('priority').value || undefined,
    due_at: dueAtInput ? new Date(dueAtInput).toISOString() : undefined,
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

(async () => {
  try {
    requireAuth();
    status.textContent = 'Signed in.';
    await loadTodos();
  } catch (err) {
    status.textContent = err.message || 'Failed to load app';
  }
})();

form.addEventListener('submit', (event) => {
  createTodo(event).catch((err) => {
    status.textContent = err.message || 'Failed to create todo';
  });
});

logoutButton.addEventListener('click', () => {
  logout();
  window.location.replace('/login');
});
