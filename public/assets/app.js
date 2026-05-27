import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';
import { hydrateFiltersFromUrl, readFilters, setFilters, syncUrl } from './todo-filters.js';
import { createTodo as submitTodo, loadTodoSummary, loadTodos } from './todo-api.js';
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

async function loadDashboard() {
  const filters = readFilters(filtersForm);
  syncUrl(filters);

  const [todos, todoSummary] = await Promise.all([
    loadTodos(filters),
    loadTodoSummary(filters),
  ]);

  renderSummary(summary, todoSummary);
  renderTodos(todosList, todos);
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
