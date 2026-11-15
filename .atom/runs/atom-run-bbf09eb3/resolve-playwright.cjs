const Module = require('node:module');
const pwModulesDir = "c:\\Users\\jayas\\Atom\\node_modules";
const origResolve = Module._resolveFilename;
const pinnedRoots = ['@playwright/test', 'playwright', 'playwright-core'];
Module._resolveFilename = function (request, parent, isMain, options) {
  if (
    typeof request === 'string' &&
    pinnedRoots.some(pkg => request === pkg || request.startsWith(pkg + '/')) &&
    options?.paths?.[0] !== pwModulesDir
  ) {
    try {
      const nextPaths = [pwModulesDir, ...(Array.isArray(options?.paths) ? options.paths : [])];
      return origResolve.call(this, request, parent, isMain, { ...(options || {}), paths: nextPaths });
    } catch (_) {
      // Fall through to default Node resolution
    }
  }
  return origResolve.call(this, request, parent, isMain, options);
};
