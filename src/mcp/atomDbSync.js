const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');
const baseConfig = require('../backend/config');
const { Persistence } = require('../backend/persistence');

const DEFAULT_TENANT_ID = 'local-tenant';
const DEFAULT_USER_ID = 'atom-ide-user';

function getSharedAtomDbRoot(env = process.env) {
  if (env.ATOM_DB_DIR) {
    return path.resolve(env.ATOM_DB_DIR);
  }
  return path.join(os.homedir(), '.atom', 'atom-db');
}

function resolveTargetDbRoots({ workspaceRoot, atomDbDir, env = process.env } = {}) {
  if (atomDbDir) {
    return [path.resolve(atomDbDir)];
  }
  const roots = new Set([getSharedAtomDbRoot(env)]);
  if (workspaceRoot && fs.existsSync(path.join(workspaceRoot, 'src', 'backend', 'server.js'))) {
    roots.add(path.resolve(workspaceRoot, 'data'));
  }
  return [...roots];
}

async function readJsonSafe(filePath, fallback) {
  try {
    if (await fs.pathExists(filePath)) {
      const parsed = await fs.readJson(filePath);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) {
    // Fallback cleanly if file is empty/corrupt
  }
  return fallback;
}

async function writeEnterpriseFiles(dbRoot, updater) {
  const testsDir = path.join(dbRoot, 'tests');
  const resultsDir = path.join(dbRoot, 'results');
  await fs.ensureDir(testsDir);
  await fs.ensureDir(resultsDir);

  const testsFile = path.join(testsDir, 'tests.json');
  const resultsFile = path.join(resultsDir, 'results.json');
  const enterpriseFile = path.join(resultsDir, 'enterprise-store.json');

  const testsDoc = await readJsonSafe(testsFile, { tests: [] });
  if (!Array.isArray(testsDoc.tests)) testsDoc.tests = [];

  const resultsDoc = await readJsonSafe(resultsFile, { results: [] });
  if (!Array.isArray(resultsDoc.results)) resultsDoc.results = [];

  const enterpriseDoc = await readJsonSafe(enterpriseFile, {
    runs: [],
    events: {},
    audit: [],
    approvals: [],
    artifacts: []
  });
  if (!Array.isArray(enterpriseDoc.runs)) enterpriseDoc.runs = [];
  if (!enterpriseDoc.events || typeof enterpriseDoc.events !== 'object' || Array.isArray(enterpriseDoc.events)) {
    enterpriseDoc.events = {};
  }
  if (!Array.isArray(enterpriseDoc.audit)) enterpriseDoc.audit = [];
  if (!Array.isArray(enterpriseDoc.approvals)) enterpriseDoc.approvals = [];
  if (!Array.isArray(enterpriseDoc.artifacts)) enterpriseDoc.artifacts = [];

  updater({ testsDoc, resultsDoc, enterpriseDoc });

  await Promise.all([
    fs.writeJson(testsFile, testsDoc, { spaces: 2 }),
    fs.writeJson(resultsFile, resultsDoc, { spaces: 2 }),
    fs.writeJson(enterpriseFile, enterpriseDoc, { spaces: 2 })
  ]);
}

function sanitizeSpecForDb(testData, specification, policy, saved, agent) {
  return {
    id: testData.id,
    prompt: testData.prompt,
    testType: testData.testType || 'ui',
    code: testData.code,
    mcpConfig: testData.mcpConfig || null,
    summary: testData.summary || '',
    specification: specification || testData.specification || null,
    policy: policy || testData.policy || null,
    savedFile: saved?.relativePath || testData.savedFile || null,
    folder: saved?.folder || testData.folder || 'atom',
    agent: agent || 'ui-agent',
    metadata: testData.metadata || {},
    version: '1.0.0'
  };
}

async function recordGeneratedTestInAtomDb({
  workspaceRoot,
  testData,
  specification,
  policy,
  saved,
  agent = 'ui-agent',
  tenantId = DEFAULT_TENANT_ID,
  actorId = DEFAULT_USER_ID,
  atomDbDir
} = {}) {
  const cleanTest = sanitizeSpecForDb(testData, specification, policy, saved, agent);
  const nowIso = new Date().toISOString();
  const auditEvent = {
    id: crypto.randomUUID(),
    tenantId,
    actorId,
    action: 'ai.test_generated',
    resourceType: 'test',
    resourceId: cleanTest.id,
    metadata: {
      testType: cleanTest.testType,
      folder: cleanTest.folder,
      savedFile: cleanTest.savedFile,
      agent,
      provider: cleanTest.metadata?.provider || 'fallback',
      model: cleanTest.metadata?.model || null
    },
    created_at: nowIso
  };

  if (baseConfig.persistence.databaseUrl) {
    const pgStore = new Persistence(baseConfig);
    try {
      await pgStore.recordAudit(auditEvent);
    } finally {
      await pgStore.close();
    }
  }

  const dbRoots = resolveTargetDbRoots({ workspaceRoot, atomDbDir });
  for (const dbRoot of dbRoots) {
    await writeEnterpriseFiles(dbRoot, ({ testsDoc, enterpriseDoc }) => {
      const existingIdx = testsDoc.tests.findIndex(t => t.id === cleanTest.id);
      const record = {
        ...cleanTest,
        created: existingIdx >= 0 ? testsDoc.tests[existingIdx].created : nowIso,
        updated: nowIso
      };
      if (existingIdx >= 0) testsDoc.tests[existingIdx] = record;
      else testsDoc.tests.push(record);

      enterpriseDoc.audit.push(auditEvent);
      if (enterpriseDoc.audit.length > 2000) {
        enterpriseDoc.audit = enterpriseDoc.audit.slice(-2000);
      }
    });
  }

  return { syncedRoots: dbRoots, testId: cleanTest.id };
}

async function recordExecutionInAtomDb({
  workspaceRoot,
  testData,
  executionResult,
  tenantId = DEFAULT_TENANT_ID,
  userId = DEFAULT_USER_ID,
  atomDbDir
} = {}) {
  const nowIso = new Date().toISOString();
  const durationMs = Number(executionResult.duration || 0);
  const startedIso = new Date(Math.max(0, Date.now() - durationMs)).toISOString();
  const finalState = executionResult.status === 'passed' ? 'passed' : 'failed';
  const runId = executionResult.runId || `atom-run-${crypto.randomBytes(4).toString('hex')}`;
  const cleanPayload = sanitizeSpecForDb(
    testData || { id: runId, prompt: 'MCP execution', testType: 'ui', code: '' },
    testData?.specification,
    executionResult.policy || testData?.policy,
    executionResult.savedFile ? { relativePath: executionResult.savedFile, folder: testData?.folder } : null,
    testData?.agent
  );

  const runRecord = {
    id: runId,
    tenant_id: tenantId,
    project_id: 'default',
    user_id: userId,
    idempotency_key: `mcp-run-${runId}`,
    state: finalState,
    test_id: cleanPayload.id || null,
    session_id: executionResult.sessionId || `mcp-${runId}`,
    payload: cleanPayload,
    result: {
      status: finalState,
      duration: durationMs,
      exitCode: executionResult.exitCode ?? (finalState === 'passed' ? 0 : 1),
      runner: executionResult.runner || 'local-playwright',
      summary: executionResult.summary || { testCount: 1, passedCount: finalState === 'passed' ? 1 : 0, failedCount: finalState === 'passed' ? 0 : 1, skippedCount: 0 },
      savedFile: executionResult.savedFile || cleanPayload.savedFile || null,
      error: executionResult.error || null
    },
    cancel_requested: false,
    created_at: startedIso,
    updated_at: nowIso,
    started_at: startedIso,
    finished_at: nowIso
  };

  const runEvents = [
    { run_id: runId, sequence: 1, tenant_id: tenantId, type: 'run.validated', payload: { state: 'validated' }, created_at: startedIso },
    { run_id: runId, sequence: 2, tenant_id: tenantId, type: 'run.running', payload: { state: 'running', runner: runRecord.result.runner }, created_at: startedIso },
    { run_id: runId, sequence: 3, tenant_id: tenantId, type: `run.${finalState}`, payload: { state: finalState, duration: durationMs, summary: runRecord.result.summary }, created_at: nowIso }
  ];

  const legacyResultRecord = {
    id: runId,
    sessionId: runRecord.session_id,
    testId: cleanPayload.id,
    testName: executionResult.testName || cleanPayload.savedFile || cleanPayload.id,
    testType: cleanPayload.testType || 'ui',
    status: finalState,
    duration: durationMs,
    summary: runRecord.result.summary,
    error: executionResult.error || null,
    timestamp: nowIso,
    saved: nowIso
  };

  if (baseConfig.persistence.databaseUrl) {
    const pgStore = new Persistence(baseConfig);
    try {
      const created = await pgStore.createRun({
        id: runId,
        tenantId,
        projectId: 'default',
        userId,
        idempotencyKey: runRecord.idempotency_key,
        testData: cleanPayload,
        sessionId: runRecord.session_id
      });
      await pgStore.transitionRun(created.run.id, tenantId, 'validated');
      await pgStore.transitionRun(created.run.id, tenantId, 'queued');
      await pgStore.transitionRun(created.run.id, tenantId, 'assigned');
      await pgStore.transitionRun(created.run.id, tenantId, 'running');
      await pgStore.transitionRun(created.run.id, tenantId, 'collecting_artifacts');
      await pgStore.transitionRun(created.run.id, tenantId, finalState, { result: runRecord.result });
      await pgStore.appendEvent(created.run.id, tenantId, `run.${finalState}`, { state: finalState, duration: durationMs, summary: runRecord.result.summary });
    } finally {
      await pgStore.close();
    }
  }

  const dbRoots = resolveTargetDbRoots({ workspaceRoot, atomDbDir });
  for (const dbRoot of dbRoots) {
    await writeEnterpriseFiles(dbRoot, ({ testsDoc, resultsDoc, enterpriseDoc }) => {
      const idx = enterpriseDoc.runs.findIndex(r => r.id === runId);
      if (idx >= 0) enterpriseDoc.runs[idx] = runRecord;
      else enterpriseDoc.runs.push(runRecord);

      enterpriseDoc.events[runId] = runEvents;
      resultsDoc.results.push(legacyResultRecord);

      if (cleanPayload.id && !testsDoc.tests.some(t => t.id === cleanPayload.id)) {
        testsDoc.tests.push({
          ...cleanPayload,
          created: startedIso,
          updated: nowIso
        });
      }
    });
  }

  return { syncedRoots: dbRoots, runId };
}

/**
 * Merges shared ~/.atom/atom-db records for a specific tenant (only local-tenant in dev mode)
 * into backend store & testManager so `npm run dev` displays executions from any IDE workspace.
 */
async function syncSharedDbIntoBackend({ store, testManager, tenantId = DEFAULT_TENANT_ID, atomDbDir, env = process.env } = {}) {
  const sharedRoot = atomDbDir ? path.resolve(atomDbDir) : getSharedAtomDbRoot(env);
  if (!(await fs.pathExists(sharedRoot))) return { syncedRuns: 0, syncedTests: 0 };

  const enterpriseFile = path.join(sharedRoot, 'results', 'enterprise-store.json');
  const testsFile = path.join(sharedRoot, 'tests', 'tests.json');
  const resultsFile = path.join(sharedRoot, 'results', 'results.json');

  const [enterpriseDoc, testsDoc, resultsDoc] = await Promise.all([
    readJsonSafe(enterpriseFile, { runs: [], events: {}, audit: [] }),
    readJsonSafe(testsFile, { tests: [] }),
    readJsonSafe(resultsFile, { results: [] })
  ]);

  let syncedRuns = 0;
  let syncedTests = 0;

  if (store && !store.pool) {
    await store.ready;
    for (const run of enterpriseDoc.runs || []) {
      if (run.tenant_id !== tenantId) continue;
      if (!store.memory.runs.has(run.id)) {
        store.memory.runs.set(run.id, run);
        store.memory.idempotency.set(`${run.tenant_id}:${run.idempotency_key}`, run.id);
        if (Array.isArray(enterpriseDoc.events?.[run.id])) {
          store.memory.events.set(run.id, enterpriseDoc.events[run.id]);
        }
        syncedRuns += 1;
      }
    }
    let syncedAudit = 0;
    const existingAuditIds = new Set(store.memory.audit.map(a => a.id));
    for (const event of enterpriseDoc.audit || []) {
      if (event.tenantId !== tenantId) continue;
      if (!existingAuditIds.has(event.id)) {
        store.memory.audit.push(event);
        existingAuditIds.add(event.id);
        syncedAudit += 1;
      }
    }
    if (syncedRuns > 0 || syncedAudit > 0) {
      await store.flush();
    }
  }

  if (testManager) {
    const existingTests = await testManager.loadTests();
    const existingIds = new Set(existingTests.map(t => t.id));
    const addedTests = (testsDoc.tests || []).filter(t => t?.id && !existingIds.has(t.id));
    if (addedTests.length) {
      await testManager.saveTests([...existingTests, ...addedTests]);
      syncedTests = addedTests.length;
    }

    const existingResults = await testManager.loadResults();
    const existingResIds = new Set(existingResults.map(r => r.id));
    const addedResults = (resultsDoc.results || []).filter(r => r?.id && !existingResIds.has(r.id));
    if (addedResults.length) {
      await testManager.saveResults([...existingResults, ...addedResults]);
    }
  }

  return { syncedRuns, syncedTests };
}

module.exports = {
  DEFAULT_TENANT_ID,
  DEFAULT_USER_ID,
  getSharedAtomDbRoot,
  resolveTargetDbRoots,
  recordGeneratedTestInAtomDb,
  recordExecutionInAtomDb,
  syncSharedDbIntoBackend
};
