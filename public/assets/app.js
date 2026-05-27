import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';
import { buildUrl, filtersToSearchParams, hydrateFiltersFromUrl, readFilters, setFilters, syncUrl } from './todo-filters.js';
import { createTodo as submitTodo } from './todo-api.js';
import { renderSummary, renderTodos } from './todo-rendering.js';

const status = document.getElementById('status');
const summary = document.getElementById('summary');
const todosList = document.getElementById('todos');
const todoForm = document.getElementById('todo-form');
const filtersForm = document.getElementById('filters-form');
const clearFiltersButton = document.getElementById('clear-filters');
const logoutButton = document.getElementById('logout');

function requireAuth() {
  const auth = getStoredAuth();
  if (!isTokenValid(auth)) {
    clearStoredAuth();
    window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    throw new Error('Authentication required');
  }
  return auth;
}

function getAuthHeaders() {
  const auth = getStoredAuth();
  return { Authorization: `Bearer ${auth.access_token}` };
}

function handleUnauthorized() {
  clearStoredAuth();
  window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  throw new Error('Authentication required');
}

async function loadDashboard() {
  const filters = readFilters(filtersForm);
  syncUrl(filters);

  const response = await fetch(buildUrl('/todos', filtersToSearchParams(filters)), {
    headers: getAuthHeaders(),
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const todoSummary = JSON.parse(response.headers.get('X-Todo-Summary') || '{}');
  renderSummary(summary, todoSummary);
  renderTodos(todosList, await response.json());
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

  await submitTodo(body);
  todoForm.reset();
  await loadDashboard();
}

(async () => {
  try {
    requireAuth();
    hydrateFiltersFromUrl(filtersForm);
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
  setFilters(filtersForm, { sort_by: 'last_viewed_desc', limit: '50' });
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
