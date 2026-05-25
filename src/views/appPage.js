const fs = require('fs');
const path = require('path');
const { getAuthEndpoints } = require('../auth/keycloak');
const { pageShell } = require('./pageShell');

function renderAppPage() {
  return pageShell({
    title: 'Todos',
    config: getAuthEndpoints(),
    scriptContent: fs.readFileSync(path.join(__dirname, '../../public/assets/app.js'), 'utf8'),
    scriptSrc: '/assets/app.js',
    body: `
      <header>
        <div>
          <h1>Your todos</h1>
          <p class="muted">Only the authenticated user can see their own todos.</p>
        </div>
        <div>
          <a href="/login">Login</a>
          <button id="logoutBtn">Logout</button>
        </div>
      </header>

      <div class="card">
        <p id="whoami" class="muted">Loading session…</p>
        <p id="message"></p>
      </div>

      <div class="card">
        <h2>Create todo</h2>
        <form id="todoForm" class="row">
          <label>Title<br /><input name="title" required /></label>
          <label>Category<br /><input name="category" /></label>
          <label>Status<br />
            <select name="status">
              <option value="">Default</option>
              <option value="pending">pending</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
            </select>
          </label>
          <label>Priority<br />
            <select name="priority">
              <option value="">Default</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label style="grid-column: 1 / -1;">Description<br /><textarea name="description" rows="3"></textarea></label>
          <button type="submit">Add todo</button>
        </form>
      </div>

      <div class="card">
        <h2>Todos</h2>
        <button id="reloadBtn">Reload</button>
        <ul id="todoList"></ul>
      </div>
    `,
  });
}

module.exports = { renderAppPage };
