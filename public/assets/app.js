import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';

const status = document.getElementById('status');
const summary = document.getElementById('summary');
const todosList = document.getElementById('todos');
const todoForm = document.getElementById('todo-form');
const filtersForm = document.getElementById('filters-form');
const clearFiltersButton = document.getElementById('clear-filters');
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

function readFilters() {
  const formData = new FormData(filtersForm);
  return {
    q: (formData.get('q') || '').toString().trim(),
    category: (formData.get('category') || '').toString().trim(),
    status: (formData.get('status') || '').toString().trim(),
    sort_by: (formData.get('sort_by') || '').toString().trim(),
    limit: (formData.get('limit') || '').toString().trim(),
  };
}

function setFilters(filters) {
  filtersForm.elements.q.value = filters.q || '';
  filtersForm.elements.category.value = filters.category || '';
  filtersForm.elements.status.value = filters.status || '';
  filtersForm.elements.sort_by.value = filters.sort_by || 'last_viewed_desc';
  filtersForm.elements.limit.value = filters.limit || '50';
}

function filtersToSearchParams(filters, { includeSortAndLimit = true } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (includeSortAndLimit) {
    if (filters.sort_by && filters.sort_by !== 'last_viewed_desc') params.set('sort_by', filters.sort_by);
    if (filters.limit && filters.limit !== '50') params.set('limit', filters.limit);
  }
  return params;
}

function buildUrl(path, params) {
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function syncUrl(filters) {
  const params = filtersToSearchParams(filters);
  const nextUrl = buildUrl(window.location.pathname, params);
  window.history.replaceState({}, '', nextUrl);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function renderSummary(data) {
  summary.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        Total
        <strong>${escapeHtml(data.total ?? 0)}</strong>
      </div>
      <div class="summary-card">
        Pending
        <strong>${escapeHtml(data.status_counts?.pending ?? 0)}</strong>
      </div>
      <div class="summary-card">
        In progress
        <strong>${escapeHtml(data.status_counts?.in_progress ?? 0)}</strong>
      </div>
      <div class="summary-card">
        Completed
        <strong>${escapeHtml(data.status_counts?.completed ?? 0)}</strong>
      </div>
    </div>
    <div class="summary-meta muted">
      Priority: low ${escapeHtml(data.priority_counts?.low ?? 0)}, medium ${escapeHtml(data.priority_counts?.medium ?? 0)}, high ${escapeHtml(data.priority_counts?.high ?? 0)}<br />
      Latest activity: ${escapeHtml(formatDate(data.latest_updated_at || data.latest_created_at))}
    </div>
  `;
}

function renderTodos(todos) {
  todosList.innerHTML = '';
  if (!todos.length) {
    todosList.innerHTML = '<li class="muted">No todos match these filters.</li>';
    return;
  }

  for (const todo of todos) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      <div class="todo-meta">${escapeHtml(todo.status)} · ${escapeHtml(todo.priority)}${todo.category ? ` · ${escapeHtml(todo.category)}` : ''}</div>
      <div>${escapeHtml(todo.description || '')}</div>
    `;
    todosList.appendChild(li);
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { headers: getAuthHeaders() });
  if (response.status === 401) {
    clearStoredAuth();
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error('Authentication required');
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

async function loadDashboard() {
  const filters = readFilters();
  syncUrl(filters);

  const response = await fetch(buildUrl('/todos', filtersToSearchParams(filters)), {
    headers: getAuthHeaders(),
  });

  if (response.status === 401) {
    clearStoredAuth();
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const todoSummary = JSON.parse(response.headers.get('X-Todo-Summary') || '{}');
  renderSummary(todoSummary);
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

  if (response.status === 401) {
    clearStoredAuth();
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return;
  }

  if (!response.ok) throw new Error(`Unable to create todo (${response.status})`);
  todoForm.reset();
  await loadDashboard();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hydrateFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  setFilters({
    q: params.get('q') || '',
    category: params.get('category') || '',
    status: params.get('status') || '',
    sort_by: params.get('sort_by') || 'last_viewed_desc',
    limit: params.get('limit') || '50',
  });
}

(async () => {
  try {
    requireAuth();
    hydrateFiltersFromUrl();
    status.textContent = 'Signed in.';
    await loadDashboard();
  } catch (err) {
    status.textContent = err.message || 'Failed to load app';
  }
})();

filtersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadDashboard().catch((err) => {
    status.textContent = err.message || 'Failed to filter todos';
  });
});

clearFiltersButton.addEventListener('click', () => {
  filtersForm.reset();
  filtersForm.elements.sort_by.value = 'last_viewed_desc';
  filtersForm.elements.limit.value = '50';
  loadDashboard().catch((err) => {
    status.textContent = err.message || 'Failed to reset filters';
  });
});

todoForm.addEventListener('submit', (event) => {
  createTodo(event).catch((err) => {
    status.textContent = err.message || 'Failed to create todo';
  });
});

logoutButton.addEventListener('click', () => {
  logout();
  window.location.replace('/login');
});
