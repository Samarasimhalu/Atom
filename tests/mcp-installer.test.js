const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const {
  PACKAGE_ROOT,
  DEFAULT_MCP_ENTRY,
  getRuntimeFile,
  installAtomMcp,
  installIdeExtension,
  runPostinstallMcpSetup
} = require('../src/mcp/installer');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('installAtomMcp safely merges Atom into workspace & detected IDE MCP configs without clobbering existing servers', t => {
  const sandbox = makeTempDir('atom-installer-');
  t.after(() => fs.removeSync(sandbox));

  const homeDir = path.join(sandbox, 'home');
  const appDataDir = path.join(sandbox, 'appdata');
  const workspaceRoot = path.join(sandbox, 'project');

  fs.ensureDirSync(path.join(workspaceRoot, '.vscode'));
  fs.writeJsonSync(path.join(workspaceRoot, '.vscode', 'mcp.json'), {
    servers: {
      existingTool: { type: 'stdio', command: 'node', args: ['other.js'] }
    }
  });

  fs.ensureDirSync(path.join(homeDir, '.copilot'));
  fs.writeJsonSync(path.join(homeDir, '.copilot', 'mcp-config.json'), {
    mcpServers: {
      github: { type: 'http', url: 'https://example.invalid/mcp' }
    }
  });

  fs.ensureDirSync(path.join(homeDir, '.cursor'));
  fs.ensureDirSync(path.join(homeDir, '.gemini', 'antigravity'));
  fs.ensureDirSync(path.join(appDataDir, 'Claude'));

  const report = installAtomMcp({
    workspaceRoot,
    homeDir,
    appDataDir,
    platform: 'win32',
    nodeCommand: 'node',
    mcpEntry: DEFAULT_MCP_ENTRY
  });

  assert.equal(report.serverName, 'Atom');
  assert.equal(report.runtime.written, true);
  assert.equal(fs.existsSync(getRuntimeFile(homeDir)), true);

  // Verify VS Code workspace preserves existingTool and adds Atom
  const wsMcp = fs.readJsonSync(path.join(workspaceRoot, '.vscode', 'mcp.json'));
  assert.ok(wsMcp.servers.existingTool);
  assert.equal(wsMcp.servers.Atom.type, 'stdio');
  assert.equal(wsMcp.servers.Atom.command, 'node');
  assert.ok(wsMcp.servers.Atom.args.includes('${workspaceFolder}'));

  // Verify Copilot config preserves github and adds Atom with tools wildcard
  const copilotMcp = fs.readJsonSync(path.join(homeDir, '.copilot', 'mcp-config.json'));
  assert.ok(copilotMcp.mcpServers.github);
  assert.equal(copilotMcp.mcpServers.Atom.type, 'local');
  assert.deepEqual(copilotMcp.mcpServers.Atom.tools, ['*']);

  // Verify Cursor, Antigravity, VS Code User, and Claude Desktop received Atom entry
  assert.ok(fs.readJsonSync(path.join(homeDir, '.cursor', 'mcp.json')).mcpServers.Atom);
  assert.ok(fs.readJsonSync(path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json')).mcpServers.Atom);
  assert.ok(fs.readJsonSync(path.join(appDataDir, 'Code', 'User', 'mcp.json')).servers.Atom);
  assert.ok(fs.readJsonSync(path.join(appDataDir, 'Claude', 'claude_desktop_config.json')).mcpServers.Atom);
});

test('installAtomMcp skips corrupted existing JSON instead of overwriting user configuration', t => {
  const sandbox = makeTempDir('atom-corrupt-');
  t.after(() => fs.removeSync(sandbox));

  const homeDir = path.join(sandbox, 'home');
  const appDataDir = path.join(sandbox, 'appdata');
  const workspaceRoot = path.join(sandbox, 'project');

  fs.ensureDirSync(path.join(workspaceRoot, '.vscode'));
  fs.writeFileSync(path.join(workspaceRoot, '.vscode', 'mcp.json'), '{ invalid json', 'utf8');

  const report = installAtomMcp({
    workspaceRoot,
    homeDir,
    appDataDir,
    clients: ['vscode-workspace'],
    includeWorkspace: true,
    includeUserClients: false
  });

  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].status, 'skipped');
  assert.equal(report.results[0].reason, 'invalid_existing_json');
  assert.equal(fs.readFileSync(path.join(workspaceRoot, '.vscode', 'mcp.json'), 'utf8'), '{ invalid json');
});

test('runPostinstallMcpSetup respects CI/opt-out flags and source repo installs', t => {
  const sandbox = makeTempDir('atom-postinstall-');
  t.after(() => fs.removeSync(sandbox));

  const ciRes = runPostinstallMcpSetup({ env: { CI: 'true' } });
  assert.equal(ciRes.skipped, true);
  assert.equal(ciRes.reason, 'ci_or_opted_out');

  const optOutRes = runPostinstallMcpSetup({ env: { ATOM_SKIP_MCP_INSTALL: '1' } });
  assert.equal(optOutRes.skipped, true);

  const sourceRes = runPostinstallMcpSetup({
    env: { INIT_CWD: PACKAGE_ROOT, npm_config_global: 'false' },
    isPostinstall: true
  });
  assert.equal(sourceRes.skipped, true);
  assert.equal(sourceRes.reason, 'source_repository_install');
});

test('installIdeExtension invokes IDE CLI with --install-extension and --force when CLI is on PATH', t => {
  const sandbox = makeTempDir('atom-ide-cli-');
  t.after(() => fs.removeSync(sandbox));

  const fakeBinDir = path.join(sandbox, 'bin');
  fs.ensureDirSync(fakeBinDir);
  const cliName = process.platform === 'win32' ? 'code.cmd' : 'code';
  fs.writeFileSync(path.join(fakeBinDir, cliName), '@echo off\n', 'utf8');

  const fakeVsix = path.join(sandbox, 'test.vsix');
  fs.writeFileSync(fakeVsix, 'PK\x03\x04dummy', 'binary');

  const oldPath = process.env.PATH;
  process.env.PATH = fakeBinDir;
  t.after(() => {
    process.env.PATH = oldPath;
  });

  const calls = [];
  const res = installIdeExtension({
    ide: 'code',
    vsixPath: fakeVsix,
    runner: (cmd, args) => {
      calls.push({ cmd, args });
      return { status: 0, stdout: 'installed', stderr: '' };
    }
  });

  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--install-extension', fakeVsix, '--force']);
  assert.equal(res.results[0].status, 'installed');
});

test('installIdeExtension executes .cmd CLI cleanly even when paths contain spaces', { skip: process.platform !== 'win32' }, t => {
  const sandbox = makeTempDir('atom-space cmd-');
  t.after(() => fs.removeSync(sandbox));

  const fakeBinDir = path.join(sandbox, 'Program Files', 'Code CLI');
  fs.ensureDirSync(fakeBinDir);
  const markerFile = path.join(sandbox, 'Program Files', 'captured-args.txt');
  fs.writeFileSync(
    path.join(fakeBinDir, 'code.cmd'),
    `@echo off\r\necho %* > "${markerFile}"\r\nexit /b 0\r\n`,
    'utf8'
  );

  const fakeVsix = path.join(sandbox, 'My Folder', 'atom-test-workspace.vsix');
  fs.ensureDirSync(path.dirname(fakeVsix));
  fs.writeFileSync(fakeVsix, 'PK\x03\x04dummy', 'binary');

  const oldPath = process.env.PATH;
  process.env.PATH = fakeBinDir;
  t.after(() => {
    process.env.PATH = oldPath;
  });

  const res = installIdeExtension({
    ide: 'code',
    vsixPath: fakeVsix
  });

  assert.equal(res.ok, true);
  assert.equal(res.results[0].status, 'installed');
  const recorded = fs.readFileSync(markerFile, 'utf8');
  assert.ok(recorded.includes('--install-extension'));
  assert.ok(recorded.includes(fakeVsix));
  assert.ok(recorded.includes('--force'));
});
