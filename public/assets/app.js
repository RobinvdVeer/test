import { clearStoredAuth, getStoredAuth, isTokenValid, logout } from './auth.js';

// ===== DOM References =====
const todosList = document.getElementById('todos');
const summarySection = document.getElementById('summary');
const form = document.getElementById('todo-form');
const logoutButton = document.getElementById('logout');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterPriority = document.getElementById('filter-priority');
const filterCategory = document.getElementById('filter-category');
const sortBySelect = document.getElementById('sort-by');
const filterCount = document.getElementById('filter-count');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const confirmDialog = document.getElementById('confirm-dialog');
const toast = document.getElementById('toast');

// ===== State =====
let allTodos = [];
let deleteTargetId = null;

// ===== Auth Helpers =====
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

// ===== Toast (chunk 4) =====
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ===== HTML Escape =====
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ===== Status / Priority labels =====
function statusLabel(status) {
  return { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' }[status] || status;
}

function priorityLabel(priority) {
  return { low: 'Low', medium: 'Medium', high: 'High' }[priority] || priority;
}

// ===== Chunk 2: Dashboard Summary Cards =====
function renderSummary(todos) {
  const total = todos.length;
  const byStatus = { pending: 0, in_progress: 0, completed: 0 };
  const byPriority = { high: 0, medium: 0, low: 0 };
  const categories = new Set();

  for (const t of todos) {
    if (t.status) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    if (t.priority) byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    if (t.category) categories.add(t.category);
  }

  summarySection.innerHTML = `
    <div class="section-header">
      <h2>Overview</h2>
    </div>
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card-label">Total</div>
        <div class="summary-card-value">${total}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Pending</div>
        <div class="summary-card-value">${byStatus.pending}</div>
        <div class="summary-card-sub">needs attention</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">In Progress</div>
        <div class="summary-card-value">${byStatus.in_progress}</div>
        <div class="summary-card-sub">being worked on</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Completed</div>
        <div class="summary-card-value">${byStatus.completed}</div>
        <div class="summary-card-sub">done ✓</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">High Priority</div>
        <div class="summary-card-value">${byPriority.high}</div>
        <div class="summary-card-sub">urgent items</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Categories</div>
        <div class="summary-card-value">${categories.size}</div>
        <div class="summary-card-sub">active groups</div>
      </div>
    </div>
  `;
}

// ===== Chunk 3: Filter / Sort / Search =====
function applyFiltersAndSort(todos) {
  let filtered = [...todos];

  // Search — title, description, category
  const search = searchInput.value.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter(t =>
      (t.title || '').toLowerCase().includes(search) ||
      (t.description || '').toLowerCase().includes(search) ||
      (t.category || '').toLowerCase().includes(search)
    );
  }

  // Status filter
  if (filterStatus.value) {
    filtered = filtered.filter(t => t.status === filterStatus.value);
  }

  // Priority filter
  if (filterPriority.value) {
    filtered = filtered.filter(t => t.priority === filterPriority.value);
  }

  // Category filter
  const catVal = filterCategory.value.trim().toLowerCase();
  if (catVal) {
    filtered = filtered.filter(t => (t.category || '').toLowerCase().includes(catVal));
  }

  // Sort
  const sort = sortBySelect.value;
  filtered.sort((a, b) => {
    switch (sort) {
      case 'created-asc':
        return (a.created_at || '').localeCompare(b.created_at || '');
      case 'title-asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'title-desc':
        return (b.title || '').localeCompare(a.title || '');
      case 'due-asc':
        return ((a.due_date || '9999').localeCompare(b.due_date || '9999'));
      case 'priority-desc': {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
      }
      default: // created-desc (default)
        return (b.created_at || '').localeCompare(a.created_at || '');
    }
  });

  return filtered;
}

// ===== Render Todos (chunk 1 structure + chunks 2-4 content) =====
function renderTodos(todos) {
  const filtered = applyFiltersAndSort(todos);
  filterCount.textContent = `${filtered.length} of ${todos.length} todo${todos.length !== 1 ? 's' : ''}`;

  todosList.innerHTML = '';

  if (filtered.length === 0) {
    const isFiltered = searchInput.value || filterStatus.value || filterPriority.value || filterCategory.value;
    todosList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          ${todos.length === 0
            ? '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>'
            : '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
          }
        </svg>
        <h3>${isFiltered ? 'No matching todos' : 'No todos yet'}</h3>
        <p>${isFiltered ? 'Try adjusting your filters or search.' : 'Create a new todo to get started.'}</p>
      </div>
    `;
    return;
  }

  const list = document.createElement('div');
  list.className = 'todo-list';

  for (const todo of filtered) {
    const li = document.createElement('div');
    li.className = `todo-item${todo.status === 'completed' ? ' completed' : ''}`;
    li.dataset.id = todo.id;

    const badgeClass =
      todo.status === 'completed' ? 'badge-completed'
      : todo.status === 'in_progress' ? 'badge-in-progress'
      : 'badge-pending';

    const badgePriorityClass = `badge-priority-${todo.priority || 'medium'}`;

    let metaHTML = `<span class="badge ${badgeClass}">${statusLabel(todo.status || 'pending')}</span>`;
    if (todo.priority) {
      metaHTML += `<span class="badge ${badgePriorityClass}">${priorityLabel(todo.priority)}</span>`;
    }

    let dueHTML = '';
    if (todo.due_date) {
      const dueDate = new Date(todo.due_date + 'T00:00:00');
      dueHTML = `<span class="todo-due-date">Due: ${dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>`;
    }

    li.innerHTML = `
      <input type="checkbox" class="todo-checkbox" ${todo.status === 'completed' ? 'checked' : ''} title="Toggle completed" />
      <div class="todo-content">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
        <div class="todo-meta">
          ${metaHTML}
          ${todo.category ? `<span class="todo-category">${escapeHtml(todo.category)}</span>` : ''}
          ${dueHTML}
        </div>
      </div>
      <div class="todo-actions">
        <button class="btn btn-ghost btn-sm edit-btn" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-ghost btn-sm delete-btn" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    `;

    // Checkbox → toggle status (chunk 4)
    const checkbox = li.querySelector('.todo-checkbox');
    checkbox.addEventListener('change', () => {
      updateTodo(todo.id, { status: checkbox.checked ? 'completed' : 'pending' });
    });

    // Edit button (chunk 4)
    li.querySelector('.edit-btn').addEventListener('click', () => openEditModal(todo));

    // Delete button (chunk 4)
    li.querySelector('.delete-btn').addEventListener('click', () => openDeleteConfirm(todo.id));

    list.appendChild(li);
  }

  todosList.appendChild(list);
}

// ===== API Operations =====
async function loadTodos() {
  const response = await fetch('/todos', { headers: getAuthHeaders() });
  if (response.status === 401) {
    clearStoredAuth();
    window.location.replace('/login');
    return;
  }
  if (!response.ok) throw new Error(`Unable to load todos (${response.status})`);
  allTodos = await response.json();
  renderSummary(allTodos);
  renderTodos(allTodos);
}

async function createTodo(event) {
  event.preventDefault();
  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value || undefined,
    category: document.getElementById('category').value || undefined,
    due_date: document.getElementById('due-date').value || undefined,
    status: document.getElementById('status-input').value || undefined,
    priority: document.getElementById('priority').value || undefined,
  };

  const response = await fetch('/todos', {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || 'Failed to create todo', 'error');
    return;
  }

  showToast('Todo created');
  form.reset();
  document.getElementById('priority').value = 'medium';
  await loadTodos();
}

async function updateTodo(id, updates) {
  const response = await fetch(`/todos/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (response.status === 404) {
    showToast('Todo not found', 'error');
    return false;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || 'Failed to update todo', 'error');
    return false;
  }

  return true;
}

async function deleteTodo(id) {
  const response = await fetch(`/todos/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (response.status === 404) {
    showToast('Todo not found', 'error');
    return false;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || 'Failed to delete todo', 'error');
    return false;
  }

  showToast('Todo deleted');
  return true;
}

// ===== Chunk 4: Edit Modal =====
function openEditModal(todo) {
  document.getElementById('edit-id').value = todo.id;
  document.getElementById('edit-title').value = todo.title || '';
  document.getElementById('edit-description').value = todo.description || '';
  document.getElementById('edit-category').value = todo.category || '';
  document.getElementById('edit-due-date').value = todo.due_date || '';
  document.getElementById('edit-status').value = todo.status || 'pending';
  document.getElementById('edit-priority').value = todo.priority || 'medium';
  editModal.style.display = 'flex';
  document.getElementById('edit-title').focus();
}

function closeEditModal() {
  editModal.style.display = 'none';
  editForm.reset();
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  const updates = {
    title: document.getElementById('edit-title').value,
    description: document.getElementById('edit-description').value || undefined,
    category: document.getElementById('edit-category').value || undefined,
    due_date: document.getElementById('edit-due-date').value || undefined,
    status: document.getElementById('edit-status').value || undefined,
    priority: document.getElementById('edit-priority').value || undefined,
  };

  const ok = await updateTodo(id, updates);
  if (ok) {
    showToast('Todo updated');
    closeEditModal();
    await loadTodos();
  }
}

// ===== Chunk 4: Delete Confirmation =====
function openDeleteConfirm(id) {
  deleteTargetId = id;
  confirmDialog.style.display = 'flex';
}

function closeDeleteConfirm() {
  deleteTargetId = null;
  confirmDialog.style.display = 'none';
}

async function handleDeleteConfirm() {
  if (!deleteTargetId) return;
  const ok = await deleteTodo(deleteTargetId);
  if (ok) {
    closeDeleteConfirm();
    await loadTodos();
  }
}

// ===== Event Listeners =====
form.addEventListener('submit', (event) => createTodo(event));

logoutButton.addEventListener('click', () => {
  logout();
  window.location.replace('/login');
});

// Chunk 3: reactive filters
searchInput.addEventListener('input', () => renderTodos(allTodos));
filterStatus.addEventListener('change', () => renderTodos(allTodos));
filterPriority.addEventListener('change', () => renderTodos(allTodos));
filterCategory.addEventListener('input', () => renderTodos(allTodos));
sortBySelect.addEventListener('change', () => renderTodos(allTodos));

// Chunk 4: edit modal
editForm.addEventListener('submit', handleEditSubmit);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

// Chunk 4: delete confirm
document.getElementById('confirm-cancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('confirm-delete').addEventListener('click', handleDeleteConfirm);
confirmDialog.addEventListener('click', (e) => {
  if (e.target === confirmDialog) closeDeleteConfirm();
});

// ===== Init =====
(async () => {
  try {
    requireAuth();

    // Show user email/name if available
    const auth = getStoredAuth();
    if (auth?.id_token) {
      try {
        const parts = auth.id_token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          const display = payload.email || payload.name || payload.sub || '';
          if (display) document.getElementById('user-display').textContent = display;
        }
      } catch (_) { /* ignore */ }
    }

    await loadTodos();
  } catch (err) {
    showToast(err.message || 'Failed to load app', 'error');
  }
})();
