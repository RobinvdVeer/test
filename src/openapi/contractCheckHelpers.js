function normalizeExpressPath(p) {
  // Express uses :param syntax; OpenAPI uses {param}
  return p.replace(/:([^/]+)/g, '{$1}');
}

function normalizeOpenApiPath(p) {
  // Keep as-is, but remove trailing slashes for comparison
  return p.replace(/\/$/, '') || '/';
}

function joinPath(a, b) {
  if (!a) a = '';
  if (a.endsWith('/')) a = a.slice(0, -1);
  if (!b.startsWith('/')) b = `/${b}`;
  const joined = `${a}${b}`;
  // Collapse multiple slashes
  return joined.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function collectExpressRoutes(app) {
  const routes = [];

  function walk(stack, prefix) {
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
        const expressPath = normalizeExpressPath(layer.route.path);
        const fullPath = joinPath(prefix, expressPath);
        routes.push({ path: fullPath, methods: methods.sort() });
      }

      // Nested routers
      if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
        const source = layer.regexp && layer.regexp.source ? layer.regexp.source : '';
        let mount = '';
        // Minimal mount-path detection for this codebase.
        if (source.includes('\\/todos')) mount = '/todos';
        walk(layer.handle.stack, joinPath(prefix, mount));
      }
    }
  }

  walk(app._router.stack, '');

  return routes;
}

function operationsFromOpenApi(openapiDoc) {
  const ops = new Set();
  const paths = openapiDoc.paths || {};
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const [method] of Object.entries(pathItem || {})) {
      if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
        ops.add(`${method.toUpperCase()} ${normalizeOpenApiPath(path)}`);
      }
    }
  }
  return ops;
}

function operationsFromExpress(routes) {
  const ops = new Set();
  for (const r of routes) {
    const path = normalizeOpenApiPath(r.path);
    for (const m of r.methods) {
      ops.add(`${m.toUpperCase()} ${path}`);
    }
  }
  return ops;
}

module.exports = {
  collectExpressRoutes,
  operationsFromOpenApi,
  operationsFromExpress,
};
