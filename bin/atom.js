#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');

const args = process.argv.slice(2);

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
  process.exit(0);
}

recordRegistryEvent('launch');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${pkg.name} v${pkg.version}
${pkg.description}

Usage:
  atom [options]

Options:
  -p, --port <port>   Port to listen on (default: 3001)
  --api-only          Start backend API only without serving the built UI
  -v, --version       Show version number
  -h, --help          Show this help message
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
