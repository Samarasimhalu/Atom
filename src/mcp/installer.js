const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const pkg = require('../../package.json');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MCP_ENTRY = path.join(PACKAGE_ROOT, 'bin', 'atom-mcp.js');
const DEFAULT_VSIX_PATH = path.join(PACKAGE_ROOT, 'ide', 'atom-vscode-extension', 'atom-test-workspace.vsix');

function getRuntimeFile(homeDir = os.homedir()) {
  return path.join(homeDir, '.atom', 'runtime.json');
}

function recordRuntimeManifest({
  homeDir = os.homedir(),
  packageRoot = PACKAGE_ROOT,
  mcpEntry = DEFAULT_MCP_ENTRY,
  vsixPath = DEFAULT_VSIX_PATH
} = {}) {
  try {
    const file = getRuntimeFile(homeDir);
    fs.ensureDirSync(path.dirname(file));
    const manifest = {
      packageName: pkg.name,
      version: pkg.version,
      packageRoot,
      mcpEntry,
      vsixPath,
      updatedAt: new Date().toISOString()
    };
    fs.writeJsonSync(file, manifest, { spaces: 2 });
    return { written: true, path: file, manifest };
  } catch (error) {
    return { written: false, error: error.message };
  }
}

function getClientTargets({
  platform = process.platform,
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
  workspaceRoot = null
} = {}) {
  const vsCodeUserDir = platform === 'win32'
    ? path.join(appDataDir, 'Code', 'User')
    : platform === 'darwin'
      ? path.join(homeDir, 'Library', 'Application Support', 'Code', 'User')
      : path.join(homeDir, '.config', 'Code', 'User');

  const claudeDir = platform === 'win32'
    ? path.join(appDataDir, 'Claude')
    : platform === 'darwin'
      ? path.join(homeDir, 'Library', 'Application Support', 'Claude')
      : path.join(homeDir, '.config', 'Claude');

  const targets = {
    vscodeUser: {
      id: 'vscode',
      label: 'VS Code (User)',
      filePath: path.join(vsCodeUserDir, 'mcp.json'),
      rootKey: 'servers',
      alwaysCreateIfParentExists: true,
      createParent: true
    },
    copilot: {
      id: 'copilot',
      label: 'GitHub Copilot CLI / Global',
      filePath: path.join(homeDir, '.copilot', 'mcp-config.json'),
      rootKey: 'mcpServers',
      entryType: 'local',
      includeToolsWildcard: true,
      alwaysCreateIfParentExists: true,
      createParent: true
    },
    cursor: {
      id: 'cursor',
      label: 'Cursor',
      filePath: path.join(homeDir, '.cursor', 'mcp.json'),
      rootKey: 'mcpServers',
      alwaysCreateIfParentExists: true,
      createParent: false
    },
    antigravity: {
      id: 'antigravity',
      label: 'Antigravity',
      filePath: path.join(homeDir, '.gemini', 'antigravity', 'mcp_config.json'),
      rootKey: 'mcpServers',
      alwaysCreateIfParentExists: true,
      createParent: false
    },
    antigravityConfig: {
      id: 'antigravity-config',
      label: 'Antigravity Global Config',
      filePath: path.join(homeDir, '.gemini', 'config', 'mcp_config.json'),
      rootKey: 'mcpServers',
      alwaysCreateIfParentExists: true,
      createParent: false
    },
    claude: {
      id: 'claude',
      label: 'Claude Desktop',
      filePath: path.join(claudeDir, 'claude_desktop_config.json'),
      rootKey: 'mcpServers',
      alwaysCreateIfParentExists: true,
      createParent: false
    }
  };

  if (workspaceRoot) {
    targets.vscodeWorkspace = {
      id: 'vscode-workspace',
      label: 'VS Code Workspace (.vscode/mcp.json)',
      filePath: path.join(path.resolve(workspaceRoot), '.vscode', 'mcp.json'),
      rootKey: 'servers',
      isWorkspace: true,
      alwaysCreateIfParentExists: true,
      createParent: true
    };
  }

  return targets;
}

function buildServerEntry(target, { nodeCommand = process.execPath, mcpEntry = DEFAULT_MCP_ENTRY, workspaceRoot = null } = {}) {
  let command = nodeCommand || 'node';
  let entryArg = mcpEntry;

  if (target.isWorkspace && workspaceRoot) {
    const localModuleEntry = path.join(path.resolve(workspaceRoot), 'node_modules', '@atomworld', 'atom', 'bin', 'atom-mcp.js');
    if (path.resolve(mcpEntry) === localModuleEntry || fs.existsSync(localModuleEntry)) {
      command = 'node';
      entryArg = './node_modules/@atomworld/atom/bin/atom-mcp.js';
    }
    return {
      type: 'stdio',
      command,
      args: [entryArg, '--workspace', '${workspaceFolder}']
    };
  }

  if (target.rootKey === 'servers') {
    return {
      type: 'stdio',
      command,
      args: [entryArg]
    };
  }

  const entry = {
    ...(target.entryType ? { type: target.entryType } : {}),
    command,
    args: [entryArg]
  };
  if (target.includeToolsWildcard) {
    entry.tools = ['*'];
  }
  return entry;
}

function mergeMcpJsonConfig(target, serverEntry, { forceCreate = false } = {}) {
  const dir = path.dirname(target.filePath);
  const parentExists = fs.existsSync(dir);
  if (!parentExists && !target.createParent && !forceCreate) {
    return { status: 'skipped', reason: 'client_not_detected', path: target.filePath };
  }

  fs.ensureDirSync(dir);
  let doc = {};
  if (fs.existsSync(target.filePath)) {
    const raw = fs.readFileSync(target.filePath, 'utf8').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { status: 'skipped', reason: 'unexpected_json_root', path: target.filePath };
        }
        doc = parsed;
      } catch (_) {
        return { status: 'skipped', reason: 'invalid_existing_json', path: target.filePath };
      }
    }
  }

  const existingSection = doc[target.rootKey];
  if (existingSection !== undefined && (typeof existingSection !== 'object' || existingSection === null || Array.isArray(existingSection))) {
    return { status: 'skipped', reason: `invalid_${target.rootKey}_section`, path: target.filePath };
  }

  doc[target.rootKey] = {
    ...(existingSection || {}),
    Atom: serverEntry
  };

  fs.writeJsonSync(target.filePath, doc, { spaces: 2 });
  return { status: 'installed', id: target.id, label: target.label, path: target.filePath };
}

function installAtomMcp({
  workspaceRoot = null,
  clients = null,
  forceCreate = false,
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
  platform = process.platform,
  nodeCommand = process.execPath,
  mcpEntry = DEFAULT_MCP_ENTRY,
  packageRoot = PACKAGE_ROOT,
  vsixPath = DEFAULT_VSIX_PATH,
  includeWorkspace = Boolean(workspaceRoot),
  includeUserClients = true
} = {}) {
  const runtime = recordRuntimeManifest({ homeDir, packageRoot, mcpEntry, vsixPath });
  const targets = getClientTargets({
    platform,
    homeDir,
    appDataDir,
    workspaceRoot: includeWorkspace ? workspaceRoot : null
  });

  const requestedSet = Array.isArray(clients) && clients.length
    ? new Set(clients.map(c => String(c).trim().toLowerCase()))
    : null;

  const results = [];
  for (const target of Object.values(targets)) {
    if (target.isWorkspace && !includeWorkspace) continue;
    if (!target.isWorkspace && !includeUserClients) continue;
    if (requestedSet && !requestedSet.has(target.id) && !requestedSet.has('all')) continue;

    try {
      const serverEntry = buildServerEntry(target, { nodeCommand, mcpEntry, workspaceRoot });
      results.push(mergeMcpJsonConfig(target, serverEntry, { forceCreate: forceCreate || Boolean(requestedSet) }));
    } catch (error) {
      results.push({ status: 'failed', id: target.id, path: target.filePath, error: error.message });
    }
  }

  return {
    serverName: 'Atom',
    mcpEntry,
    runtime,
    results
  };
}

function resolveIdeCli(name, platform = process.platform) {
  const candidates = platform === 'win32'
    ? [`${name}.cmd`, name]
    : [name];
  const pathDirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const exe of candidates) {
      const candidate = path.join(dir, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function invokeIdeCli(cliPath, args, platform, runner) {
  if (runner === spawnSync && platform === 'win32' && /\.(cmd|bat)$/i.test(cliPath)) {
    const comspec = process.env.ComSpec || 'cmd.exe';
    const cmdLine = `"${[cliPath, ...args].map(quoteCmdArg).join(' ')}"`;
    return runner(comspec, ['/d', '/s', '/c', cmdLine], {
      encoding: 'utf8',
      timeout: 20000,
      windowsVerbatimArguments: true
    });
  }
  return runner(cliPath, args, {
    encoding: 'utf8',
    timeout: 20000,
    shell: false
  });
}

function installIdeExtension({
  ide = 'all',
  vsixPath = DEFAULT_VSIX_PATH,
  platform = process.platform,
  runner = spawnSync
} = {}) {
  let effectiveVsix = vsixPath;
  if (!fs.existsSync(effectiveVsix)) {
    const packagerPath = path.join(PACKAGE_ROOT, 'scripts', 'package-ide-extension.js');
    if (fs.existsSync(packagerPath)) {
      const { packageExtension } = require(packagerPath);
      const packaged = packageExtension({ outputPath: effectiveVsix });
      effectiveVsix = packaged.outputPath;
    }
  }

  if (!fs.existsSync(effectiveVsix)) {
    return { ok: false, reason: 'vsix_not_found', vsixPath: effectiveVsix, results: [] };
  }

  const requested = ide === 'all'
    ? ['code', 'cursor', 'agy']
    : String(ide).split(',').map(v => v.trim().toLowerCase()).filter(Boolean);

  const results = [];
  for (const cliName of requested) {
    const cliPath = resolveIdeCli(cliName, platform);
    if (!cliPath) {
      results.push({ ide: cliName, status: 'skipped', reason: 'cli_not_found' });
      continue;
    }
    try {
      const proc = invokeIdeCli(cliPath, ['--install-extension', effectiveVsix, '--force'], platform, runner);
      if (proc.status === 0) {
        results.push({ ide: cliName, status: 'installed', cliPath, vsixPath: effectiveVsix });
      } else {
        results.push({
          ide: cliName,
          status: 'failed',
          cliPath,
          exitCode: proc.status,
          error: (proc.stderr || proc.stdout || 'install_failed').trim().slice(0, 300)
        });
      }
    } catch (error) {
      results.push({ ide: cliName, status: 'failed', cliPath, error: error.message });
    }
  }

  return {
    ok: results.some(r => r.status === 'installed'),
    vsixPath: effectiveVsix,
    results
  };
}

function runPostinstallMcpSetup({ env = process.env, isPostinstall = true } = {}) {
  if (env.CI === 'true' || env.ATOM_SKIP_MCP_INSTALL === '1' || env.NODE_ENV === 'test') {
    return { skipped: true, reason: 'ci_or_opted_out' };
  }

  const initCwd = env.INIT_CWD ? path.resolve(env.INIT_CWD) : null;
  const isGlobal = env.npm_config_global === 'true';
  const runningInsideSourceRepo = initCwd && path.resolve(initCwd) === PACKAGE_ROOT;

  if (isPostinstall && runningInsideSourceRepo && !isGlobal) {
    const runtime = recordRuntimeManifest();
    return { skipped: true, reason: 'source_repository_install', runtime };
  }

  const mcpInstall = installAtomMcp({
    workspaceRoot: (!isGlobal && initCwd && !runningInsideSourceRepo) ? initCwd : null,
    includeWorkspace: Boolean(!isGlobal && initCwd && !runningInsideSourceRepo),
    includeUserClients: true
  });

  let ideInstall = null;
  if (env.ATOM_SKIP_IDE_INSTALL !== '1' && fs.existsSync(DEFAULT_VSIX_PATH)) {
    ideInstall = installIdeExtension({ ide: 'all' });
  }

  return {
    skipped: false,
    mcpInstall,
    ideInstall
  };
}

module.exports = {
  PACKAGE_ROOT,
  DEFAULT_MCP_ENTRY,
  DEFAULT_VSIX_PATH,
  getRuntimeFile,
  recordRuntimeManifest,
  getClientTargets,
  buildServerEntry,
  mergeMcpJsonConfig,
  installAtomMcp,
  resolveIdeCli,
  installIdeExtension,
  runPostinstallMcpSetup
};
