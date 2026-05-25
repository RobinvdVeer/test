function escapeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pageShell({ title, body, config, scriptSrc }) {
  const configScript = config === undefined
    ? ''
    : `<script>window.__AUTH_CONFIG__ = ${escapeForInlineScript(config)};</script>`;

  const scriptTag = scriptSrc
    ? `<script defer src="${scriptSrc}"></script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; padding: 2rem; max-width: 960px; }
      header { display: flex; gap: 1rem; align-items: center; justify-content: space-between; }
      button, input, textarea, select { font: inherit; }
      button { cursor: pointer; }
      .card { border: 1px solid #9996; border-radius: 12px; padding: 1rem; margin: 1rem 0; }
      .row { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .muted { opacity: .75; }
      ul { padding-left: 1.25rem; }
      li { margin: .5rem 0; }
      .todo { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
      .todo small { display: block; opacity: .75; }
      .status { font-weight: 600; }
      .error { color: #c33; }
      .success { color: #090; }
      a { color: inherit; }
    </style>
    ${configScript}
    ${scriptTag}
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

module.exports = { pageShell };
