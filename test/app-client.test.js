const fs = require('fs');
const path = require('path');

function createControl(defaultValue = '') {
  return {
    value: defaultValue,
    defaultValue,
    addEventListener: jest.fn(),
  };
}

function createClickableElement() {
  return {
    addEventListener: jest.fn(function addEventListener(type, handler) {
      this.listeners = this.listeners || {};
      this.listeners[type] = handler;
    }),
    listeners: {},
  };
}

function createListElement() {
  return {
    innerHTML: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
  };
}

function createForm(fields) {
  return {
    elements: fields,
    listeners: {},
    addEventListener: jest.fn(function addEventListener(type, handler) {
      this.listeners[type] = handler;
    }),
    reset: jest.fn(function reset() {
      for (const field of Object.values(this.elements)) {
        field.value = field.defaultValue;
      }
    }),
  };
}

function createLocation(search = '') {
  return {
    pathname: '/',
    search,
    replace: jest.fn(),
    assign: jest.fn(),
  };
}

function createFormDataClass() {
  return class FakeFormData {
    constructor(form) {
      this.form = form;
    }

    get(name) {
      return this.form.elements[name]?.value ?? '';
    }
  };
}

function createResponse({ ok, status = 200, json }) {
  return {
    ok,
    status,
    json: async () => json,
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function loadDashboardClient({ search = '', fetchImpl } = {}) {
  const status = { textContent: '', innerHTML: '' };
  const summary = { innerHTML: '' };
  const todos = createListElement();

  const title = createControl('');
  const description = createControl('');
  const category = createControl('');
  const statusInput = createControl('');
  const priority = createControl('');

  const searchInput = createControl('');
  const filterCategory = createControl('');
  const filterStatus = createControl('');
  const sortBy = createControl('last_viewed_desc');
  const limit = createControl('50');

  const todoForm = createForm({
    title,
    description,
    category,
    status: statusInput,
    priority,
  });

  const filtersForm = createForm({
    q: searchInput,
    category: filterCategory,
    status: filterStatus,
    sort_by: sortBy,
    limit,
  });

  const clearFiltersButton = createClickableElement();
  const logoutButton = createClickableElement();

  const elementsById = {
    status,
    summary,
    todos,
    'todo-form': todoForm,
    'filters-form': filtersForm,
    'clear-filters': clearFiltersButton,
    logout: logoutButton,
    title,
    description,
    category,
    'status-input': statusInput,
    priority,
    search: searchInput,
    'filter-category': filterCategory,
    'filter-status': filterStatus,
    'sort-by': sortBy,
    limit,
  };

  const document = {
    getElementById: jest.fn((id) => elementsById[id] || null),
    createElement: jest.fn((tagName) => ({
      tagName: tagName.toUpperCase(),
      innerHTML: '',
      textContent: '',
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
    })),
  };

  const window = {
    location: createLocation(search),
    history: {
      replaceState: jest.fn(),
    },
  };

  const auth = {
    clearStoredAuth: jest.fn(),
    getStoredAuth: jest.fn(() => ({ access_token: 'access-token' })),
    isTokenValid: jest.fn(() => true),
    logout: jest.fn(),
  };

  const fetchMock =
    fetchImpl ||
    jest.fn(async (url) => {
      if (String(url).startsWith('/todos/summary')) {
        return createResponse({ ok: true, json: { total: 0, status_counts: { pending: 0, in_progress: 0, completed: 0 }, priority_counts: { low: 0, medium: 0, high: 0 }, latest_created_at: null, latest_updated_at: null } });
      }

      return createResponse({ ok: true, json: [] });
    });

  const source = fs.readFileSync(path.join(__dirname, '../public/assets/app.js'), 'utf8');
  const transformed = source.replace(
    "import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';",
    'const { clearStoredAuth, getStoredAuth, isTokenValid, logout } = auth;'
  );

  const factory = new Function(
    'auth',
    'document',
    'window',
    'fetch',
    'FormData',
    'URLSearchParams',
    transformed
  );

  factory(auth, document, window, fetchMock, createFormDataClass(), URLSearchParams);
  await flush();

  return {
    auth,
    clearFiltersButton,
    description,
    document,
    fetchMock,
    filtersForm,
    limit,
    logoutButton,
    priority,
    searchInput,
    sortBy,
    status,
    summary,
    todoForm,
    title,
    todos,
    window,
    category,
    filterCategory,
    filterStatus,
    statusInput,
  };
}

describe('dashboard browser client', () => {
  test('hydrates filters from the URL and loads the dashboard on first render', async () => {
    const env = await loadDashboardClient({
      search: '?q=build&category=work&status=pending&sort_by=updated_desc&limit=25',
    });

    expect(env.searchInput.value).toBe('build');
    expect(env.filterCategory.value).toBe('work');
    expect(env.filterStatus.value).toBe('pending');
    expect(env.sortBy.value).toBe('updated_desc');
    expect(env.limit.value).toBe('25');

    expect(env.fetchMock).toHaveBeenNthCalledWith(
      1,
      '/todos?q=build&category=work&status=pending&sort_by=updated_desc&limit=25',
      { headers: { Authorization: 'Bearer access-token' } }
    );
    expect(env.fetchMock).toHaveBeenNthCalledWith(
      2,
      '/todos/summary?q=build&category=work&status=pending',
      { headers: { Authorization: 'Bearer access-token' } }
    );
    expect(env.window.history.replaceState).toHaveBeenCalledWith(
      {},
      '',
      '/?q=build&category=work&status=pending&sort_by=updated_desc&limit=25'
    );
    expect(env.status.textContent).toBe('Signed in.');
  });

  test('submitting filters reloads the dashboard and updates the URL', async () => {
    const env = await loadDashboardClient();

    env.searchInput.value = 'later';
    env.filterCategory.value = 'home';
    env.filterStatus.value = 'completed';
    env.sortBy.value = 'created_asc';
    env.limit.value = '100';

    await env.filtersForm.listeners.submit({ preventDefault: jest.fn() });
    await flush();

    expect(env.fetchMock).toHaveBeenNthCalledWith(
      3,
      '/todos?q=later&category=home&status=completed&sort_by=created_asc&limit=100',
      { headers: { Authorization: 'Bearer access-token' } }
    );
    expect(env.fetchMock).toHaveBeenNthCalledWith(
      4,
      '/todos/summary?q=later&category=home&status=completed',
      { headers: { Authorization: 'Bearer access-token' } }
    );
    expect(env.window.history.replaceState).toHaveBeenLastCalledWith(
      {},
      '',
      '/?q=later&category=home&status=completed&sort_by=created_asc&limit=100'
    );
  });

  test('resetting filters restores defaults and reloads the default dashboard', async () => {
    const env = await loadDashboardClient({ search: '?q=build&category=work&status=pending' });

    env.searchInput.value = 'later';
    env.filterCategory.value = 'home';
    env.filterStatus.value = 'completed';
    env.sortBy.value = 'created_asc';
    env.limit.value = '100';

    await env.clearFiltersButton.listeners.click();
    await flush();

    expect(env.filtersForm.reset).toHaveBeenCalledTimes(1);
    expect(env.sortBy.value).toBe('last_viewed_desc');
    expect(env.limit.value).toBe('50');
    expect(env.searchInput.value).toBe('');
    expect(env.filterCategory.value).toBe('');
    expect(env.filterStatus.value).toBe('');
    expect(env.fetchMock).toHaveBeenNthCalledWith(3, '/todos', {
      headers: { Authorization: 'Bearer access-token' },
    });
    expect(env.fetchMock).toHaveBeenNthCalledWith(4, '/todos/summary', {
      headers: { Authorization: 'Bearer access-token' },
    });
  });

  test('401 responses redirect to login', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (String(url).startsWith('/todos/summary')) {
        return createResponse({ ok: true, json: { total: 0, status_counts: { pending: 0, in_progress: 0, completed: 0 }, priority_counts: { low: 0, medium: 0, high: 0 }, latest_created_at: null, latest_updated_at: null } });
      }

      return createResponse({ ok: false, status: 401, json: { error: 'Unauthorized' } });
    });

    const env = await loadDashboardClient({ fetchImpl });

    expect(env.auth.clearStoredAuth).toHaveBeenCalled();
    expect(env.window.location.replace).toHaveBeenCalledWith('/login?returnTo=%2F');
    expect(env.status.textContent).toBe('Authentication required');
  });
});
