function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function renderSummary(summaryElement, data) {
  summaryElement.innerHTML = `
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

export function renderTodos(todosListElement, todos) {
  todosListElement.innerHTML = '';
  if (!todos.length) {
    todosListElement.innerHTML = '<li class="muted">No todos match these filters.</li>';
    return;
  }

  for (const todo of todos) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="todo-title">${escapeHtml(todo.title)}</div>
      <div class="todo-meta">${escapeHtml(todo.status)} · ${escapeHtml(todo.priority)}${todo.category ? ` · ${escapeHtml(todo.category)}` : ''}</div>
      <div>${escapeHtml(todo.description || '')}</div>
    `;
    todosListElement.appendChild(li);
  }
}
