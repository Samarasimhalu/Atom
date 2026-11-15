#!/usr/bin/env node

const path = require('path');
const pkg = require('../package.json');
const { AtomMcpServer } = require('../src/mcp/server');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Atom MCP Server (${pkg.name} v${pkg.version})

Usage:
  atom-mcp [options]

Options:
  -w, --workspace <dir>  Workspace root directory (default: current working directory)
  --api-url <url>        Optional ATOM backend API base URL (e.g. http://localhost:3001)
  -v, --version          Show version number
  -h, --help             Show this help message
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

function readFlag(names) {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  }
  return null;
}

const workspaceArg = readFlag(['--workspace', '-w']);
const workspaceRoot = workspaceArg ? path.resolve(workspaceArg) : process.cwd();
const apiBaseUrl = readFlag(['--api-url']) || process.env.ATOM_API_URL || '';

const server = new AtomMcpServer({ workspaceRoot, apiBaseUrl });
server.startStdio();
