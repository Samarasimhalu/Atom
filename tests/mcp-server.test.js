const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const http = require('node:http');
const { spawn } = require('node:child_process');

const { AtomMcpServer, buildToolsCatalog, PROMPTS_CATALOG } = require('../src/mcp/server');
const { AtomWorkspaceEngine } = require('../src/mcp/workspaceEngine');
const { extractTargetUrlsFromPrompt } = require('../src/mcp/webInspector');
const { syncSharedDbIntoBackend } = require('../src/mcp/atomDbSync');
const { detectProviderFromKey, generateWithUserProvider } = require('../src/mcp/llmClient');
const { Persistence } = require('../src/backend/persistence');
const TestManager = require('../src/backend/testManager');
const baseConfig = require('../src/backend/config');
const {
  resolveTargetFolder,
  extractExplicitFolderFromPrompt,
  saveTestToWorkspace
} = require('../src/mcp/workspaceStorage');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atom-mcp-ws-'));
}

function testDbDir(workspaceRoot) {
  return path.join(workspaceRoot, '.atom', 'test-atom-db');
}

test('AtomMcpServer initializes with name Atom and exposes all Test Workspace tools, prompts, and resources', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const server = new AtomMcpServer({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) });

  const init = await server.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' }
  });
  assert.equal(init.result.serverInfo.name, 'Atom');
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.capabilities.tools);
  assert.ok(init.result.capabilities.resources);
  assert.ok(init.result.capabilities.prompts);

  const notif = await server.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(notif, null);

  const ping = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(ping.result, {});

  const listTools = await server.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  const toolNames = listTools.result.tools.map(tool => tool.name);
  assert.deepEqual(toolNames, buildToolsCatalog().map(tool => tool.name));
  for (const requiredTool of [
    'atom_create_test',
    'atom_execute_test',
    'atom_stop_execution',
    'atom_run_task',
    'atom_list_tests',
    'atom_read_test',
    'atom_delete_test',
    'atom_policy_audit',
    'atom_pulse_gaps',
    'atom_list_agents'
  ]) {
    assert.ok(toolNames.includes(requiredTool), `Missing tool ${requiredTool}`);
  }

  const agentsRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'atom_list_agents', arguments: { workspaceRoot } }
  });
  const caps = agentsRes.result.structuredContent;
  assert.equal(caps.serverName, 'Atom');
  assert.equal(caps.defaultFolder, 'atom');
  assert.equal(caps.agents.length, 6);
  assert.deepEqual(
    caps.agents.map(a => a.id),
    ['ui-agent', 'mobile-agent', 'api-agent', 'visual-agent', 'mixed-agent', 'atom-qa']
  );
  assert.deepEqual(caps.llmProviders.map(p => p.id), ['openai', 'anthropic', 'google']);
  assert.equal(caps.tasks.length, 6);
  assert.deepEqual(caps.testTypes.map(item => item.id), ['ui', 'api', 'visual', 'mixed', 'mobile']);

  const promptsRes = await server.handleMessage({ jsonrpc: '2.0', id: 5, method: 'prompts/list' });
  assert.equal(promptsRes.result.prompts.length, PROMPTS_CATALOG.length);

  const promptGet = await server.handleMessage({
    jsonrpc: '2.0',
    id: 6,
    method: 'prompts/get',
    params: { name: 'create-ui-test', arguments: { scenario: 'Verify cart checkout', folder: 'smoke' } }
  });
  assert.match(promptGet.result.messages[0].content.text, /smoke/);
});

test('Generated tests default to atom/ folder, honor explicit folders, extract folder from prompt, and block traversal', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const server = new AtomMcpServer({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) });

  // 1. Default atom/ folder when omitted
  const defaultRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'atom_create_test',
      arguments: {
        prompt: 'Verify multi-step checkout workflow with confirmation',
        testType: 'ui',
        targetUrl: 'https://example.com',
        workspaceRoot
      }
    }
  });
  assert.equal(defaultRes.result.isError, false);
  const createdDefault = defaultRes.result.structuredContent;
  assert.equal(createdDefault.saved.folder, 'atom');
  assert.equal(createdDefault.saved.usedDefaultFolder, true);
  assert.ok(createdDefault.saved.relativePath.startsWith('atom/'));
  assert.equal(fs.existsSync(path.join(workspaceRoot, createdDefault.saved.relativePath)), true);

  // 2. Explicit folder parameter
  const explicitArgRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'atom_create_test',
      arguments: {
        prompt: 'Chain customer creation API with order lookup',
        testType: 'api',
        agent: 'api-planner',
        folder: 'e2e/api-suite',
        filename: 'customer-order',
        workspaceRoot
      }
    }
  });
  assert.equal(explicitArgRes.result.isError, false);
  const createdExplicit = explicitArgRes.result.structuredContent;
  assert.equal(createdExplicit.saved.folder, 'e2e/api-suite');
  assert.equal(createdExplicit.saved.usedDefaultFolder, false);
  assert.equal(createdExplicit.saved.relativePath, 'e2e/api-suite/customer-order.spec.ts');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'e2e/api-suite/customer-order.spec.ts')), true);

  // 3. Explicit folder extracted directly from natural-language prompt
  assert.equal(extractExplicitFolderFromPrompt('Verify billing invoice totals and save it in folder billing/regression'), 'billing/regression');
  const promptFolderRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'atom_create_test',
      arguments: {
        prompt: 'Verify billing invoice totals and save it in folder billing/regression',
        testType: 'visual',
        workspaceRoot
      }
    }
  });
  assert.equal(promptFolderRes.result.isError, false);
  assert.equal(promptFolderRes.result.structuredContent.saved.folder, 'billing/regression');
  assert.equal(promptFolderRes.result.structuredContent.saved.usedDefaultFolder, false);

  // 4. Path traversal outside workspace must fail
  assert.throws(() => resolveTargetFolder({ workspaceRoot, folder: '../../outside' }), /invalid_target_folder/);
  const traversalRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'atom_create_test',
      arguments: {
        prompt: 'Attempt unsafe path',
        folder: '../escaped',
        workspaceRoot
      }
    }
  });
  assert.equal(traversalRes.result.isError, true);
  assert.equal(traversalRes.result.structuredContent.error, 'invalid_target_folder');

  // 5. Resources & listing & reading & deleting
  const resourcesList = await server.handleMessage({ jsonrpc: '2.0', id: 14, method: 'resources/list' });
  assert.ok(resourcesList.result.resources.some(r => r.uri === 'atom://workspace/summary'));
  assert.ok(resourcesList.result.resources.some(r => r.uri === `atom://tests/${createdDefault.test.id}`));

  const readTestRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 15,
    method: 'tools/call',
    params: { name: 'atom_read_test', arguments: { testId: createdDefault.test.id, workspaceRoot } }
  });
  assert.equal(readTestRes.result.structuredContent.relativePath, createdDefault.saved.relativePath);

  const resourceRead = await server.handleMessage({
    jsonrpc: '2.0',
    id: 16,
    method: 'resources/read',
    params: { uri: `atom://tests/${createdDefault.test.id}` }
  });
  assert.ok(resourceRead.result.contents[0].text.length > 0);

  const deleteRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 17,
    method: 'tools/call',
    params: { name: 'atom_delete_test', arguments: { testId: createdDefault.test.id, workspaceRoot } }
  });
  assert.equal(deleteRes.result.structuredContent.deleted, true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, createdDefault.saved.relativePath)), false);
});

test('Agents and tasks enforce mobile Appium guard, unsafe code denial, policy audit, and Pulse gaps', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const server = new AtomMcpServer({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) });

  // Mobile generation succeeds, local execution fails closed without Appium worker
  const mobileCreated = await server.handleMessage({
    jsonrpc: '2.0',
    id: 20,
    method: 'tools/call',
    params: {
      name: 'atom_run_task',
      arguments: {
        agent: 'mobile-agent',
        task: 'generate_and_save',
        testType: 'mobile',
        prompt: 'Verify native Android cart screen',
        options: { mobile: { platform: 'android', deviceName: 'Pixel 8' } },
        workspaceRoot
      }
    }
  });
  const mobilePayload = mobileCreated.result.structuredContent;
  assert.equal(mobilePayload.agent.id, 'mobile-agent');
  assert.equal(mobilePayload.saved.folder, 'atom');

  const mobileExec = await server.handleMessage({
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: {
      name: 'atom_execute_test',
      arguments: { testId: mobilePayload.test.id, executionMode: 'local-playwright', workspaceRoot }
    }
  });
  assert.equal(mobileExec.result.isError, true);
  assert.equal(mobileExec.result.structuredContent.error, 'mobile_requires_appium_worker');

  // Policy audit + Pulse gaps via atom-qa agent
  const qaAudit = await server.handleMessage({
    jsonrpc: '2.0',
    id: 22,
    method: 'tools/call',
    params: {
      name: 'atom_run_task',
      arguments: {
        agent: 'atom-qa',
        task: 'policy_audit',
        prompt: 'Audit login test flow',
        testType: 'ui',
        workspaceRoot
      }
    }
  });
  assert.equal(qaAudit.result.isError, false);
  assert.equal(qaAudit.result.structuredContent.audit.passed, true);

  const pulseRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 23,
    method: 'tools/call',
    params: {
      name: 'atom_run_task',
      arguments: { agent: 'atom-qa', task: 'pulse_gaps', workspaceRoot }
    }
  });
  assert.equal(pulseRes.result.isError, false);
  assert.equal(pulseRes.result.structuredContent.pulse.source, 'local-pulse');
  assert.ok(Array.isArray(pulseRes.result.structuredContent.pulse.gaps.gaps));

  // Unsafe generated/edited file on disk must be denied before execution
  const unsafeSaved = await saveTestToWorkspace({
    workspaceRoot,
    folder: 'atom',
    filename: 'unsafe-attempt.spec.ts',
    testData: {
      id: 'unsafe-test-1',
      prompt: 'Unsafe command invocation',
      testType: 'ui',
      code: `import { test } from '@playwright/test';\nconst { execSync } = require('child_process');\ntest('bad', async () => { execSync('whoami'); });\n`
    }
  });
  const engine = new AtomWorkspaceEngine({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) });
  const unsafeAudit = await engine.auditPolicy({ workspaceRoot, filePath: unsafeSaved.relativePath });
  assert.equal(unsafeAudit.passed, false);
  assert.ok(unsafeAudit.staticFindings.includes('unsafe_code_pattern'));

  const unsafeExec = await engine.executeTest({
    workspaceRoot,
    testId: 'unsafe-test-1',
    executionMode: 'local-playwright'
  });
  assert.equal(unsafeExec.status, 'failed');
  assert.equal(unsafeExec.error, 'unsafe_code_pattern_denied');
});

test('Local Playwright runner executes offline Playwright spec cleanly and persists lastRun summary', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const saved = await saveTestToWorkspace({
    workspaceRoot,
    folder: 'atom',
    filename: 'offline-smoke.spec.ts',
    testData: {
      id: 'offline-smoke-1',
      prompt: 'Offline assertion test',
      testType: 'api',
      code: [
        "import { test, expect } from '@playwright/test';",
        '',
        "test('offline assertion passes inside temp workspace', async () => {",
        '  expect(2 + 2).toBe(4);',
        '});',
        ''
      ].join('\n'),
      mcpConfig: {
        name: 'offline-smoke',
        description: 'Offline assertion test',
        type: 'api',
        browser: 'chromium',
        tags: ['api', 'smoke'],
        timeout: 15000,
        retries: 0
      }
    }
  });

  const engine = new AtomWorkspaceEngine({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) });
  const execResult = await engine.executeTest({
    workspaceRoot,
    testId: 'offline-smoke-1',
    executionMode: 'local-playwright'
  });

  assert.equal(execResult.runner, 'local-playwright');
  assert.equal(execResult.status, 'passed', `Expected pass, got logs:\n${execResult.logs.map(l => l.content).join('\n')}`);
  assert.equal(execResult.summary.testCount, 1);
  assert.equal(execResult.summary.passedCount, 1);
  assert.equal(execResult.savedFile, saved.relativePath);

  const reloaded = await new AtomMcpServer({ workspaceRoot, atomDbDir: testDbDir(workspaceRoot) }).callTool('atom_read_test', {
    testId: 'offline-smoke-1',
    workspaceRoot
  });
  assert.equal(reloaded.structuredContent.lastRun.status, 'passed');
});

test('Real stdio subprocess bin/atom-mcp.js frames clean JSON-RPC and writes tests under atom/', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const mcpEntry = path.join(REPO_ROOT, 'bin', 'atom-mcp.js');
  const child = spawn(process.execPath, [mcpEntry, '--workspace', workspaceRoot], {
    cwd: REPO_ROOT,
    env: { ...process.env, ATOM_DB_DIR: testDbDir(workspaceRoot) },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const frames = [];
  let stdoutBuf = '';
  let stderrBuf = '';

  child.stderr.on('data', chunk => {
    stderrBuf += chunk.toString();
  });

  const exitPromise = new Promise(resolve => {
    child.on('close', code => resolve(code));
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Stdio MCP timeout. Frames=${frames.length}, stderr=${stderrBuf}`)), 15000);

    child.stdout.on('data', chunk => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Every single line written to stdout MUST be valid JSON-RPC
        frames.push(JSON.parse(trimmed));
      }
      if (frames.length >= 3) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'atom_create_test',
        arguments: {
          prompt: 'Verify homepage renders navigation links',
          testType: 'ui',
          workspaceRoot
        }
      }
    })}\n`);
  });

  child.stdin.end();
  const exitCode = await exitPromise;
  assert.equal(exitCode, 0);

  const initFrame = frames.find(f => f.id === 1);
  assert.equal(initFrame.result.serverInfo.name, 'Atom');

  const toolsFrame = frames.find(f => f.id === 2);
  assert.ok(toolsFrame.result.tools.some(t => t.name === 'atom_create_test'));

  const createFrame = frames.find(f => f.id === 3);
  assert.equal(createFrame.result.isError, false);
  const relPath = createFrame.result.structuredContent.saved.relativePath;
  assert.ok(relPath.startsWith('atom/'));
  assert.equal(fs.existsSync(path.join(workspaceRoot, relPath)), true);
});

test('resolveTargetFolder normalizes pasted inside-workspace paths and blocks outside paths', t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const pastedInside = path.join(workspaceRoot, 'tests', 'checkout-e2e');
  const resolvedInside = resolveTargetFolder({ workspaceRoot, folder: pastedInside });
  assert.equal(resolvedInside.folder, 'tests/checkout-e2e');
  assert.equal(resolvedInside.usedDefault, false);

  const outsidePath = path.resolve(workspaceRoot, '..', 'atom-outside-escape');
  assert.throws(() => resolveTargetFolder({ workspaceRoot, folder: outsidePath }), /invalid_target_folder/);
});

test('LLM provider selector routes OpenAI, Anthropic, and Google keys securely without leaking keys to disk', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  assert.equal(detectProviderFromKey('sk-proj-openai123'), 'openai');
  assert.equal(detectProviderFromKey('sk-ant-api03-123'), 'anthropic');
  assert.equal(detectProviderFromKey('AIzaSyGoogleKey123'), 'google');

  const seenUrls = [];
  const seenHeaders = [];
  const fakeCode = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('provider generated smoke', async () => {",
    '  expect(1 + 1).toBe(2);',
    '});'
  ].join('\n');

  const mockFetch = async (url, init = {}) => {
    seenUrls.push(String(url));
    seenHeaders.push(init.headers || {});
    if (String(url).includes('api.openai.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: fakeCode } }] })
      };
    }
    if (String(url).includes('api.anthropic.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: fakeCode }] })
      };
    }
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: fakeCode }] } }] })
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const atomDbDir = testDbDir(workspaceRoot);
  const engine = new AtomWorkspaceEngine({ workspaceRoot, atomDbDir, fetchImpl: mockFetch });

  const cases = [
    { apiKey: 'sk-test-openai-secret-999', provider: 'openai', model: 'gpt-4o', urlMatch: 'api.openai.com' },
    { apiKey: 'sk-ant-secret-888', provider: 'anthropic', model: 'claude-sonnet-4-20250514', urlMatch: 'api.anthropic.com' },
    { apiKey: 'AIzaTestSecretKey777', provider: 'google', model: 'gemini-2.5-flash', urlMatch: 'generativelanguage.googleapis.com' }
  ];

  for (const item of cases) {
    const res = await engine.generateTest({
      workspaceRoot,
      agent: 'ui-agent',
      prompt: `Verify ${item.provider} checkout flow`,
      folder: `custom-${item.provider}`,
      llm: { provider: item.provider, model: item.model, apiKey: item.apiKey }
    });
    assert.equal(res.test.metadata.provider, item.provider);
    assert.equal(res.test.metadata.model, item.model);
    assert.equal(res.saved.folder, `custom-${item.provider}`);
    assert.ok(seenUrls.some(u => u.includes(item.urlMatch)));
  }

  // Ensure none of the secret API keys were persisted in specs, tests-index, or atomDbDir
  const dumpFiles = [
    ...(await fs.readdir(path.join(workspaceRoot, '.atom', 'specs'))).map(f => path.join(workspaceRoot, '.atom', 'specs', f)),
    path.join(workspaceRoot, '.atom', 'tests-index.json'),
    path.join(atomDbDir, 'tests', 'tests.json'),
    path.join(atomDbDir, 'results', 'enterprise-store.json')
  ];
  for (const file of dumpFiles) {
    const raw = await fs.readFile(file, 'utf8');
    for (const item of cases) {
      assert.equal(raw.includes(item.apiKey), false, `API key leaked into ${file}`);
    }
  }
});

test('Generated and executed tests sync automatically into Atom DB and feed dashboard metrics for npm run dev', async t => {
  const workspaceRoot = makeTempWorkspace();
  const backendRoot = makeTempWorkspace();
  t.after(() => {
    fs.removeSync(workspaceRoot);
    fs.removeSync(backendRoot);
  });

  const atomDbDir = testDbDir(workspaceRoot);
  const engine = new AtomWorkspaceEngine({ workspaceRoot, atomDbDir });

  // Generate a valid runnable Playwright assertion test into atom/
  const saved = await saveTestToWorkspace({
    workspaceRoot,
    folder: 'atom',
    filename: 'dashboard-metrics.spec.ts',
    testData: {
      id: 'dash-sync-test-1',
      prompt: 'Dashboard metrics sync test',
      testType: 'api',
      code: [
        "import { test, expect } from '@playwright/test';",
        '',
        "test('dashboard sync passes cleanly', async () => {",
        '  expect(10).toBe(10);',
        '});'
      ].join('\n'),
      mcpConfig: {
        name: 'dashboard-metrics',
        description: 'Dashboard metrics sync test',
        type: 'api',
        browser: 'chromium',
        tags: ['api'],
        timeout: 15000,
        retries: 0
      }
    }
  });

  const created = await engine.generateTest({
    workspaceRoot,
    agent: 'ui-agent',
    prompt: 'Verify homepage header'
  });
  assert.ok(created.saved.relativePath.startsWith('atom/'));

  const execRes = await engine.executeTest({
    workspaceRoot,
    filePath: saved.relativePath,
    executionMode: 'local-playwright'
  });
  assert.equal(execRes.status, 'passed');

  // Verify shared atomDbDir received tests, runs, results, and audit records
  const dbEnterprise = await fs.readJson(path.join(atomDbDir, 'results', 'enterprise-store.json'));
  assert.ok(dbEnterprise.runs.some(r => r.id === execRes.runId && r.state === 'passed'));
  assert.ok(dbEnterprise.audit.some(a => a.action === 'ai.test_generated'));

  // Sync shared atomDbDir into an isolated backend Persistence + TestManager store
  const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };
  const backendCfg = {
    ...baseConfig,
    environment: 'development',
    persistence: { ...baseConfig.persistence, databaseUrl: '', mode: 'local' },
    storage: {
      tests: path.join(backendRoot, 'tests'),
      results: path.join(backendRoot, 'results'),
      screenshots: path.join(backendRoot, 'screenshots'),
      videos: path.join(backendRoot, 'videos'),
      traces: path.join(backendRoot, 'traces')
    }
  };
  Object.values(backendCfg.storage).forEach(dir => fs.ensureDirSync(dir));
  fs.writeJsonSync(path.join(backendCfg.storage.tests, 'tests.json'), { tests: [] });
  fs.writeJsonSync(path.join(backendCfg.storage.results, 'results.json'), { results: [] });
  const testManager = new TestManager(backendCfg);
  const store = new Persistence(backendCfg, silentLogger);

  const synced = await syncSharedDbIntoBackend({
    store,
    testManager,
    tenantId: 'local-tenant',
    atomDbDir
  });
  assert.ok(synced.syncedRuns >= 1);
  assert.ok(synced.syncedTests >= 1);

  const dashboard = await store.getDashboard('local-tenant');
  const analytics = await testManager.getDashboardAnalytics();
  assert.ok(dashboard.totalRuns >= 1);
  assert.ok(dashboard.states.passed >= 1);
  assert.ok(analytics.overview.totalTests >= 1);
  assert.ok(analytics.overview.totalExecutions >= 1);
});

test('Live DOM inspector scrapes target URL elements for free AI generation and passes real Playwright execution', async t => {
  const workspaceRoot = makeTempWorkspace();
  const atomDbDir = testDbDir(workspaceRoot);

  const server = http.createServer((req, res) => {
    if (req.url === '/login' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><title>Portal Sign In</title></head>
  <body>
    <main>
      <h1>Portal Login</h1>
      <p>Use Username: qa_demo and Password: DemoPass!99</p>
      <form method="post" action="/auth" onsubmit="event.preventDefault(); window.location.href='/dashboard';">
        <label for="portal_user">User</label>
        <input id="portal_user" name="portal_user" type="text" />
        <label for="portal_pass">Password</label>
        <input id="portal_pass" name="portal_pass" type="password" />
        <button id="portal_signin_btn" type="submit">Sign In Now</button>
      </form>
    </main>
  </body>
</html>`);
      return;
    }
    if (req.url === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Welcome Dashboard</h1></body></html>');
      return;
    }
    res.writeHead(404).end('Not found');
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    fs.removeSync(workspaceRoot);
  });

  const { port } = server.address();
  const loginUrl = `http://127.0.0.1:${port}/login`;
  const prompt = `Create a UI test case to perform login on "${loginUrl}" with username and password.`;
  assert.deepEqual(extractTargetUrlsFromPrompt(prompt), [loginUrl]);

  const engine = new AtomWorkspaceEngine({ workspaceRoot, atomDbDir });
  const created = await engine.generateTest({
    workspaceRoot,
    agent: 'ui-agent',
    prompt,
    llm: { provider: 'free' }
  });

  assert.ok(created.inspectedDom, 'Expected target URL to be inspected');
  assert.ok(created.inspectedDom.inputsCount >= 2);
  assert.ok(created.inspectedDom.buttonsCount >= 1);
  assert.equal(created.test.code.includes('atomworld.net'), false, 'Should never fall back to hardcoded atomworld.net');
  assert.ok(created.test.code.includes(loginUrl), 'Generated spec must target inspected login URL');
  assert.ok(created.test.code.includes('#portal_user'), 'Generated spec must use inspected username selector');
  assert.ok(created.test.code.includes('#portal_pass'), 'Generated spec must use inspected password selector');
  assert.ok(created.test.code.includes('#portal_signin_btn'), 'Generated spec must use inspected submit button selector');
  assert.ok(created.test.code.includes('qa_demo'), 'Generated spec should extract demo username hint');
  assert.ok(created.test.code.includes('/\\/login$/i'), 'Generated URL regex must properly escape slashes');

  const execRes = await engine.executeTest({
    workspaceRoot,
    testId: created.test.id,
    executionMode: 'local-playwright',
    allowLocalhost: true
  });
  assert.equal(execRes.status, 'passed', `Expected live scraped login test to pass, logs:\n${execRes.logs.map(l => l.content).join('\n')}`);
});

test('Active execution streams real-time MCP log notifications and stops cleanly on cancellation', async t => {
  const workspaceRoot = makeTempWorkspace();
  t.after(() => fs.removeSync(workspaceRoot));

  const saved = await saveTestToWorkspace({
    workspaceRoot,
    folder: 'atom',
    filename: 'long-sleep.spec.ts',
    testData: {
      id: 'long-sleep-test',
      prompt: 'Long sleep test for cancellation',
      testType: 'api',
      code: [
        "import { test, expect } from '@playwright/test';",
        '',
        "test('waits long enough to be stopped', async () => {",
        '  await new Promise(resolve => setTimeout(resolve, 20000));',
        '  expect(1).toBe(1);',
        '});'
      ].join('\n')
    }
  });

  const notifications = [];
  const server = new AtomMcpServer({
    workspaceRoot,
    atomDbDir: testDbDir(workspaceRoot),
    onNotification: msg => notifications.push(msg)
  });

  const execPromise = server.handleMessage({
    jsonrpc: '2.0',
    id: 91,
    method: 'tools/call',
    params: {
      name: 'atom_execute_test',
      arguments: {
        filePath: saved.relativePath,
        executionMode: 'local-playwright',
        executionToken: 'exec-stop-test-1',
        workspaceRoot
      }
    }
  });

  // Wait until the runner actually starts spawning Playwright before issuing stop
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (notifications.some(n => n.method === 'notifications/atom.executionLog' && String(n.params?.content || '').includes('[Worker Mesh]'))) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const stopRes = await server.handleMessage({
    jsonrpc: '2.0',
    id: 92,
    method: 'tools/call',
    params: {
      name: 'atom_stop_execution',
      arguments: { executionToken: 'exec-stop-test-1', workspaceRoot }
    }
  });
  assert.equal(stopRes.result.structuredContent.stopped, true);

  const execResponse = await execPromise;
  const payload = execResponse.result.structuredContent;
  assert.equal(payload.status, 'cancelled');
  assert.equal(payload.error, 'execution_cancelled_by_user');
  assert.ok(notifications.some(n => n.method === 'notifications/atom.executionLog' && n.params?.executionToken === 'exec-stop-test-1'));
  assert.ok(notifications.some(n => String(n.params?.content || '').includes('Stop requested by user')));
});

test('AtomWorkspaceEngine auto-discovers local npm run dev backend and sends live /api/mcp/sync telemetry hits', async t => {
  const workspaceRoot = makeTempWorkspace();
  const atomDbDir = testDbDir(workspaceRoot);
  const receivedEvents = [];

  const mockDevServer = http.createServer((req, res) => {
    if (req.url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', config: { workerExecutionEnabled: false } }));
      return;
    }
    if (req.url === '/api/mcp/sync' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          receivedEvents.push(JSON.parse(body));
        } catch (_) {
          // ignore
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise(resolve => mockDevServer.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    mockDevServer.close();
    fs.removeSync(workspaceRoot);
  });

  const { port } = mockDevServer.address();
  const engine = new AtomWorkspaceEngine({
    workspaceRoot,
    atomDbDir,
    defaultBackendUrls: [`http://127.0.0.1:${port}`],
    skipBackendAutoProbe: false
  });

  const saved = await saveTestToWorkspace({
    workspaceRoot,
    folder: 'atom',
    filename: 'live-backend-hit.spec.ts',
    testData: {
      id: 'live-sync-hit-1',
      prompt: 'Live backend hit verification',
      testType: 'api',
      code: [
        "import { test, expect } from '@playwright/test';",
        "test('passes cleanly', async () => { expect(true).toBe(true); });"
      ].join('\n')
    }
  });

  await engine.generateTest({
    workspaceRoot,
    agent: 'ui-agent',
    prompt: 'Verify live backend sync hit',
    llm: { provider: 'free' }
  });

  const execRes = await engine.executeTest({
    workspaceRoot,
    filePath: saved.relativePath,
    executionMode: 'auto'
  });

  assert.equal(execRes.status, 'passed');
  const eventTypes = receivedEvents.map(e => e.event);
  assert.ok(eventTypes.includes('test.generated'), `Expected test.generated event, got: ${JSON.stringify(eventTypes)}`);
  assert.ok(eventTypes.includes('run.started'), `Expected run.started event, got: ${JSON.stringify(eventTypes)}`);
  assert.ok(eventTypes.includes('run.log'), `Expected run.log event, got: ${JSON.stringify(eventTypes)}`);
  assert.ok(eventTypes.includes('run.completed'), `Expected run.completed event, got: ${JSON.stringify(eventTypes)}`);
  const completedEvent = receivedEvents.find(e => e.event === 'run.completed');
  assert.equal(completedEvent.result.status, 'passed');
});
