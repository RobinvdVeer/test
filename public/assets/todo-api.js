import { clearStoredAuth, getStoredAuth } from './auth.js';

function getAuthHeaders() {
  const auth = getStoredAuth();
  return { Authorization: `Bearer ${auth.access_token}` };
}

function handleUnauthorized() {
  clearStoredAuth();
  window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  throw new Error('Authentication required');
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

export function loadTodos(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort_by && filters.sort_by !== 'last_viewed_desc') params.set('sort_by', filters.sort_by);
  if (filters.limit && filters.limit !== '50') params.set('limit', filters.limit);

  return fetchJson(`/todos${params.toString() ? `?${params.toString()}` : ''}`);
}

export function loadTodoSummary(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);

  return fetchJson(`/todos/summary${params.toString() ? `?${params.toString()}` : ''}`);
}

export async function createTodo(body) {
  return fetchJson('/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
