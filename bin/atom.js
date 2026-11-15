#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const {
  installAtomMcp,
  installIdeExtension,
  runPostinstallMcpSetup
} = require('../src/mcp/installer');

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args[0] : null;

function readFlag(names) {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  }
  return null;
}

function recordRegistryEvent(type) {
  try {
    const dir = path.join(os.homedir(), '.atom');
    const file = path.join(dir, 'registry-telemetry.json');
    fs.mkdirSync(dir, { recursive: true });
    let current = { events: [] };
    if (fs.existsSync(file)) {
      current = JSON.parse(fs.readFileSync(file, 'utf8')) || { events: [] };
    }
    const events = Array.isArray(current.events) ? current.events : [];
    events.push({ type, version: pkg.version, timestamp: new Date().toISOString() });
    const cutoff = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const pruned = events.filter(e => new Date(e.timestamp).getTime() >= cutoff).slice(-500);
    fs.writeFileSync(file, JSON.stringify({ events: pruned }, null, 2), 'utf8');
  } catch (_) {
    // ignore telemetry write errors in restricted environments
  }
}

if (args.includes('--record-install')) {
  recordRegistryEvent('install');
  try {
    const summary = runPostinstallMcpSetup({ isPostinstall: true });
    if (!summary.skipped && process.env.npm_config_loglevel !== 'silent') {
      const installed = (summary.mcpInstall?.results || []).filter(r => r.status === 'installed');
      if (installed.length) {
        console.log(`Atom MCP installed for: ${installed.map(r => r.label).join(', ')}`);
      }
      const ides = (summary.ideInstall?.results || []).filter(r => r.status === 'installed');
      if (ides.length) {
        console.log(`ATOM IDE Right-Sidebar extension installed for: ${ides.map(r => r.ide).join(', ')}`);
      }
    }
  } catch (_) {
    // Never fail npm postinstall in restricted environments
  }
  process.exit(0);
}

if (command === 'mcp') {
  const { AtomMcpServer } = require('../src/mcp/server');
  const workspaceArg = readFlag(['--workspace', '-w']);
  const apiUrl = readFlag(['--api-url']) || process.env.ATOM_API_URL || '';
  const mcpServer = new AtomMcpServer({
    workspaceRoot: workspaceArg ? path.resolve(workspaceArg) : process.cwd(),
    apiBaseUrl: apiUrl
  });
  mcpServer.startStdio();
  return;
}

if (command === 'install-mcp') {
  const workspaceArg = readFlag(['--workspace', '-w']);
  const clientsArg = readFlag(['--clients']);
  const clients = clientsArg ? clientsArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  const workspaceRoot = args.includes('--no-workspace') ? null : path.resolve(workspaceArg || process.cwd());
  const report = installAtomMcp({
    workspaceRoot,
    clients,
    forceCreate: Boolean(clients),
    includeWorkspace: Boolean(workspaceRoot),
    includeUserClients: !args.includes('--no-user')
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (command === 'install-ide') {
  const ide = readFlag(['--ide']) || 'all';
  const report = installIdeExtension({ ide });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && !report.results.some(r => r.status === 'installed')) {
    process.exitCode = 1;
  }
  process.exit();
}

if (command === 'setup') {
  const workspaceArg = readFlag(['--workspace', '-w']);
  const ide = readFlag(['--ide']) || 'all';
  const mcp = installAtomMcp({
    workspaceRoot: path.resolve(workspaceArg || process.cwd()),
    includeWorkspace: true,
    includeUserClients: true
  });
  const ideResult = installIdeExtension({ ide });
  console.log(JSON.stringify({ mcp, ide: ideResult }, null, 2));
  process.exit(0);
}

recordRegistryEvent('launch');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

Usage:
  atom [command] [options]

Commands:
  (default)             Start ATOM Test Workspace server & API
  mcp                   Start the Atom MCP server (stdio JSON-RPC 2.0)
  install-mcp           Register the Atom MCP server in VS Code, Copilot, Cursor, Antigravity & Claude
  install-ide           Install the ATOM Right-Sidebar Test Workspace IDE extension
  setup                 Configure both Atom MCP and the IDE Right-Sidebar extension

Options:
  -p, --port <port>     Port to listen on (default: 3001)
  -w, --workspace <dir> Workspace root for MCP / setup (default: cwd)
  --api-only            Start backend API only without serving the built UI
  -v, --version         Show version number
  -h, --help            Show this help message
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

const portIdx = args.findIndex(arg => arg === '-p' || arg === '--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  process.env.PORT = String(args[portIdx + 1]);
}

if (!args.includes('--api-only')) {
  process.env.ATOM_SERVE_UI = 'true';
}

const effectivePort = Number(process.env.PORT || 3001);
if (process.env.ATOM_SERVE_UI === 'true' && !process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS = `http://localhost:${effectivePort},http://127.0.0.1:${effectivePort},http://localhost:5173`;
}

const config = require('../src/backend/config');
const { server, store } = require('../src/backend/server');

server.listen(config.port, '0.0.0.0', () => {
  console.log(`ATOM v${pkg.version} running at http://localhost:${config.port}`);
  if (process.env.ATOM_SERVE_UI === 'true') {
    console.log(`Test Workspace UI: http://localhost:${config.port}`);
  }
  console.log(`API Health:        http://localhost:${config.port}/api/health`);
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down ATOM...`);
  server.close(async () => {
    try {
      await store.close();
    } catch (_) {
      // ignore close errors during shutdown
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
