const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const baseConfig = require('../backend/config');
const AITestGenerator = require('../backend/aiTestGenerator');
const { validateGenerationRequest } = require('../backend/validation');
const { normalizeGeneratedTest } = require('../backend/testSpecification');
const PolicyEngine = require('../backend/policyEngine');
const { PulseService } = require('../backend/pulse');

const {
  TEST_TYPES,
  BROWSERS,
  MOBILE_PLATFORMS,
  EXAMPLE_PROMPTS,
  ATOM_TASKS,
  ATOM_AGENTS,
  resolveAgentAndTask
} = require('./agents');
const {
  DEFAULT_TEST_FOLDER,
  resolveTargetFolder,
  resolvePathInsideWorkspace,
  saveTestToWorkspace,
  listWorkspaceTests,
  getWorkspaceTest,
  updateTestLastRun,
  deleteWorkspaceTest,
  getStatePaths
} = require('./workspaceStorage');
const { LLM_PROVIDERS, generateWithUserProvider } = require('./llmClient');
const { extractTargetUrlsFromPrompt, inspectWebsiteDom } = require('./webInspector');
const { recordGeneratedTestInAtomDb, recordExecutionInAtomDb } = require('./atomDbSync');

const UNSAFE_CODE_RE = /\b(child_process|execSync|spawn|fork|eval|Function\s*\(|process\.env|fs\.)\b/;

function buildAuthHeaders(auth = {}) {
  return {
    'Content-Type': 'application/json',
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth.devUser ? { 'X-Dev-User': auth.devUser } : { 'X-Dev-User': 'atom-ide-user' }),
    ...(auth.tenantId ? { 'X-Tenant-Id': auth.tenantId } : { 'X-Tenant-Id': 'local-tenant' })
  };
}

function normalizeTargetUrl(rawUrl) {
  if (!rawUrl || !String(rawUrl).trim()) return '';
  const value = String(rawUrl).trim();
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('target_url_must_be_http_or_https');
  }
  return parsed.toString();
}

function applyTargetUrlToCode(code, targetUrl) {
  if (!targetUrl) return code;
  const origin = new URL(targetUrl).origin;
  return String(code || '')
    .replace(/https:\/\/www\.atomworld\.net/g, origin)
    .replace(/https:\/\/example\.com/g, targetUrl);
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function resolvePlaywrightCli(workspaceRoot) {
  const candidates = [
    path.join(workspaceRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    path.resolve(__dirname, '..', '..', 'node_modules', '@playwright', 'test', 'cli.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    return require.resolve('@playwright/test/cli');
  } catch (_) {
    return null;
  }
}

function parsePlaywrightSummary(reportJson, exitCode) {
  const summary = { testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0 };
  const walkSuite = suite => {
    for (const spec of suite?.specs || []) {
      for (const testCase of spec?.tests || []) {
        summary.testCount += 1;
        const lastResult = Array.isArray(testCase.results) && testCase.results.length
          ? testCase.results[testCase.results.length - 1]
          : null;
        const status = lastResult?.status || testCase.status || 'failed';
        if (status === 'passed' || status === 'expected') summary.passedCount += 1;
        else if (status === 'skipped') summary.skippedCount += 1;
        else summary.failedCount += 1;
      }
    }
    for (const child of suite?.suites || []) {
      walkSuite(child);
    }
  };
  if (reportJson && Array.isArray(reportJson.suites)) {
    reportJson.suites.forEach(walkSuite);
  }
  if (summary.testCount === 0) {
    summary.testCount = 1;
    if (exitCode === 0) summary.passedCount = 1;
    else summary.failedCount = 1;
  }
  return summary;
}

async function collectMediaFiles(dir, mediaOutDir, workspaceRoot) {
  const media = { screenshots: [], videos: [], traces: [] };
  if (!(await fs.pathExists(dir))) return media;
  await fs.ensureDir(mediaOutDir);

  const walk = async currentDir => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const lower = entry.name.toLowerCase();
      let bucket = null;
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) bucket = 'screenshots';
      else if (lower.endsWith('.webm') || lower.endsWith('.mp4')) bucket = 'videos';
      else if (lower.endsWith('.zip') && lower.includes('trace')) bucket = 'traces';
      if (!bucket) continue;

      const destName = `${media[bucket].length + 1}-${entry.name}`;
      const destPath = path.join(mediaOutDir, destName);
      await fs.copy(fullPath, destPath, { overwrite: true });
      const stat = await fs.stat(destPath);
      media[bucket].push({
        filename: destName,
        filePath: destPath,
        relativePath: path.relative(workspaceRoot, destPath).replace(/\\/g, '/'),
        size: stat.size
      });
    }
  };

  await walk(dir);
  return media;
}

class AtomWorkspaceEngine {
  constructor(options = {}) {
    this.config = options.config || baseConfig;
    this.defaultWorkspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.apiBaseUrl = options.apiBaseUrl || process.env.ATOM_API_URL || '';
    this.defaultLocalBackendUrls = options.defaultBackendUrls || ['http://127.0.0.1:3001', 'http://localhost:3001'];
    this.skipBackendAutoProbe = options.skipBackendAutoProbe ?? Boolean(
      options.atomDbDir || process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT
    );
    this.aiGenerator = options.aiGenerator || new AITestGenerator(this.config);
    this.policyEngine = options.policyEngine || new PolicyEngine(this.config);
    this.atomDbDir = options.atomDbDir || null;
    this.fetchImpl = options.fetchImpl || fetch;
    this.activeExecutions = new Map();
  }

  getWorkspaceRoot(workspaceRoot) {
    return path.resolve(workspaceRoot || this.defaultWorkspaceRoot);
  }

  async resolveBackend(apiBaseUrl) {
    const explicit = apiBaseUrl || this.apiBaseUrl;
    if (explicit === 'none') return { configured: false, reachable: false, url: null, workerExecutionEnabled: false };

    const candidates = explicit
      ? [explicit]
      : (this.skipBackendAutoProbe ? [] : this.defaultLocalBackendUrls);

    for (const candidate of candidates) {
      const url = String(candidate || '').trim().replace(/\/+$/, '');
      if (!url) continue;
      try {
        const res = await fetchJsonWithTimeout(`${url}/api/health`, {}, 700);
        if (res.ok) {
          return {
            configured: true,
            autoDiscovered: !explicit,
            reachable: true,
            url,
            workerExecutionEnabled: Boolean(res.body?.config?.workerExecutionEnabled),
            health: res.body
          };
        }
      } catch (_) {
        // try next candidate
      }
    }

    return explicit
      ? { configured: true, reachable: false, url: explicit, workerExecutionEnabled: false }
      : { configured: false, reachable: false, url: null, workerExecutionEnabled: false };
  }

  async syncEventToBackend(backendUrl, payload, auth = {}) {
    if (!backendUrl) return false;
    try {
      const base = backendUrl.replace(/\/+$/, '');
      const res = await fetchJsonWithTimeout(
        `${base}/api/mcp/sync`,
        {
          method: 'POST',
          headers: buildAuthHeaders(auth),
          body: JSON.stringify(payload)
        },
        1500
      );
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  async getCapabilities(workspaceRoot) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    const tests = await listWorkspaceTests({ workspaceRoot: root });
    const folders = [...new Set([DEFAULT_TEST_FOLDER, ...tests.map(t => t.folder).filter(Boolean)])];
    const backendHealth = await this.resolveBackend(this.apiBaseUrl);
    return {
      serverName: 'Atom',
      workspaceRoot: root,
      defaultFolder: DEFAULT_TEST_FOLDER,
      folders,
      agents: ATOM_AGENTS,
      tasks: ATOM_TASKS,
      testTypes: TEST_TYPES,
      browsers: BROWSERS,
      mobilePlatforms: MOBILE_PLATFORMS,
      llmProviders: LLM_PROVIDERS,
      examplePrompts: EXAMPLE_PROMPTS,
      backend: backendHealth,
      testsCount: tests.length
    };
  }

  async checkBackendHealth(apiBaseUrl) {
    return this.resolveBackend(apiBaseUrl);
  }

  async generateTest({
    workspaceRoot,
    prompt,
    testType,
    folder,
    filename,
    overwrite = false,
    agent = 'ui-agent',
    task = 'generate_and_save',
    options = {},
    llm = {},
    save = true,
    apiBaseUrl,
    auth = {}
  } = {}) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    const resolved = resolveAgentAndTask(agent, task);
    const effectiveType = testType || resolved.agent.defaultTestType || 'ui';

    const cleanOptions = { ...(options || {}) };
    const extractedUrls = extractTargetUrlsFromPrompt(prompt);
    const explicitTarget = cleanOptions.targetUrl ? normalizeTargetUrl(cleanOptions.targetUrl) : '';
    const targetUrl = explicitTarget || extractedUrls[0] || '';
    const skipInspect = Boolean(cleanOptions.skipDomInspect);
    delete cleanOptions.targetUrl;
    delete cleanOptions.skipDomInspect;
    const environment = cleanOptions.environment || 'development';
    delete cleanOptions.environment;

    if (effectiveType === 'mobile' && !cleanOptions.mobile) {
      cleanOptions.mobile = { platform: 'android' };
    }

    const validated = validateGenerationRequest({
      prompt,
      testType: effectiveType,
      options: cleanOptions
    });

    let inspectedDom = null;
    if (targetUrl && !skipInspect && effectiveType !== 'mobile' && effectiveType !== 'api') {
      try {
        inspectedDom = await inspectWebsiteDom(targetUrl, {
          fetchImpl: this.fetchImpl,
          timeoutMs: 12000
        });
      } catch (_) {
        inspectedDom = null;
      }
    }

    let generated = null;
    let llmWarning = null;

    // Generate with user-selected provider key OR free AI + live inspected DOM
    if ((llm && (llm.apiKey || llm.provider === 'free' || !llm.provider || llm.provider === 'fallback')) || inspectedDom || targetUrl) {
      try {
        generated = await generateWithUserProvider({
          llm,
          aiGenerator: this.aiGenerator,
          prompt: validated.prompt,
          testType: validated.testType,
          options: validated.options,
          inspectedDom,
          targetUrl,
          fetchImpl: this.fetchImpl
        });
      } catch (error) {
        llmWarning = error.message;
      }
    }

    const backendInfo = await this.resolveBackend(apiBaseUrl);
    if (!generated && backendInfo.reachable) {
      try {
        const res = await fetchJsonWithTimeout(
          `${backendInfo.url}/api/generate/test`,
          {
            method: 'POST',
            headers: buildAuthHeaders(auth),
            body: JSON.stringify(validated)
          },
          4000
        );
        if (res.ok && res.body?.code) {
          generated = res.body;
        }
      } catch (_) {
        // Fall through cleanly to local AITestGenerator
      }
    }

    if (!generated) {
      generated = await this.aiGenerator.generateTest(
        validated.prompt,
        validated.testType,
        validated.options,
        { tenantId: auth.tenantId || 'local-tenant', correlationId: `mcp-${Date.now()}` }
      );
      if (llmWarning) {
        generated.metadata = {
          ...(generated.metadata || {}),
          provider: 'fallback',
          llmWarning
        };
      }
    }

    if (targetUrl && (!inspectedDom || /atomworld\.net/i.test(String(generated.code || '')))) {
      generated.code = applyTargetUrlToCode(generated.code, targetUrl);
      generated.target = { url: targetUrl, environment };
    } else if (targetUrl) {
      generated.target = { url: targetUrl, environment };
    }

    const specification = normalizeGeneratedTest(generated);
    const policy = this.policyEngine.evaluate(specification, {
      tenantId: auth.tenantId || 'local-tenant',
      userId: auth.devUser || 'atom-ide-user'
    });

    const testData = {
      ...generated,
      specification,
      policy
    };

    let saved = null;
    if (save !== false) {
      saved = await saveTestToWorkspace({
        workspaceRoot: root,
        testData,
        folder,
        filename,
        overwrite,
        agent: resolved.agent.id,
        task: resolved.task.id,
        policy,
        specification
      });
    } else {
      const folderResolution = resolveTargetFolder({ workspaceRoot: root, folder, prompt: validated.prompt });
      saved = {
        folder: folderResolution.folder,
        filePath: null,
        relativePath: null,
        usedDefaultFolder: folderResolution.usedDefault
      };
    }

    try {
      await recordGeneratedTestInAtomDb({
        workspaceRoot: root,
        testData,
        specification,
        policy,
        saved,
        agent: resolved.agent.id,
        tenantId: auth.tenantId || 'local-tenant',
        actorId: auth.devUser || 'atom-ide-user',
        atomDbDir: this.atomDbDir
      });
    } catch (_) {
      // Do not fail workspace generation if optional DB mirror is non-writable
    }

    if (backendInfo.reachable) {
      await this.syncEventToBackend(backendInfo.url, {
        event: 'test.generated',
        testData: {
          ...testData,
          savedFile: saved.relativePath,
          folder: saved.folder,
          agent: resolved.agent.id
        }
      }, auth);
    }

    return {
      agent: resolved.agent,
      task: resolved.task,
      test: {
        ...testData,
        savedFile: saved.relativePath,
        folder: saved.folder
      },
      saved,
      specification,
      policy,
      inspectedDom: inspectedDom
        ? {
            url: inspectedDom.finalUrl || inspectedDom.url,
            title: inspectedDom.title,
            method: inspectedDom.method,
            inputsCount: inspectedDom.inputs?.length || 0,
            buttonsCount: inspectedDom.buttons?.length || 0
          }
        : null
    };
  }

  async auditPolicy({ workspaceRoot, testId, filePath, testData } = {}) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    let subject = testData;
    let sourcePath = null;
    if (!subject && (testId || filePath)) {
      const found = await getWorkspaceTest({ workspaceRoot: root, testId, filePath });
      if (!found) throw new Error('test_not_found');
      subject = found.testData;
      sourcePath = found.relativePath;
    }
    if (!subject) throw new Error('test_specification_required');

    const specification = normalizeGeneratedTest(subject);
    const policy = this.policyEngine.evaluate(specification, { tenantId: 'local-tenant', userId: 'atom-ide-user' });
    const staticFindings = [];
    if (UNSAFE_CODE_RE.test(String(subject.code || ''))) {
      staticFindings.push('unsafe_code_pattern');
    }
    if (subject.testType === 'mobile' && /\bremote\s*\(/.test(String(subject.code || ''))) {
      staticFindings.push('mobile_script_must_use_managed_session');
    }

    return {
      sourcePath,
      specification,
      policy,
      staticFindings,
      passed: policy.allowed && staticFindings.length === 0
    };
  }

  async stopExecution({ runId, executionToken, auth = {} } = {}) {
    const matched = [];
    if (executionToken && this.activeExecutions.has(executionToken)) {
      matched.push(this.activeExecutions.get(executionToken));
    } else if (runId && this.activeExecutions.has(runId)) {
      matched.push(this.activeExecutions.get(runId));
    } else if (!executionToken && !runId) {
      for (const entry of new Set(this.activeExecutions.values())) {
        matched.push(entry);
      }
    }

    if (matched.length === 0) {
      return { stopped: false, reason: 'no_active_execution', runId: runId || null, executionToken: executionToken || null };
    }

    const stoppedRuns = [];
    for (const entry of new Set(matched)) {
      if (!entry) continue;
      entry.cancelled = true;
      if (entry.emitLog) {
        entry.emitLog('[ATOM Runner] Stop requested by user. Terminating active execution...', 'stderr');
      }
      if (entry.emitState) {
        entry.emitState('cancelled', { runId: entry.runId, executionToken: entry.executionToken, reason: 'stopped_by_user' });
      }
      if (entry.abortController) {
        try {
          entry.abortController.abort();
        } catch (_) {
          // ignore
        }
      }
      if (entry.childProcess && !entry.childProcess.killed) {
        const pid = entry.childProcess.pid;
        if (process.platform === 'win32' && pid) {
          try {
            const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
              stdio: 'ignore',
              windowsHide: true
            });
            killer.on('error', () => {});
            killer.unref();
          } catch (_) {
            // ignore
          }
        }
        try {
          entry.childProcess.kill('SIGKILL');
        } catch (_) {
          // ignore
        }
      }
      if (entry.backendUrl && entry.backendRunId) {
        try {
          const base = entry.backendUrl.replace(/\/+$/, '');
          await fetchJsonWithTimeout(
            `${base}/api/runs/${encodeURIComponent(entry.backendRunId)}/cancel`,
            {
              method: 'POST',
              headers: buildAuthHeaders(entry.auth || auth)
            },
            2000
          );
        } catch (_) {
          // ignore cancellation sync errors
        }
      }
      stoppedRuns.push(entry.runId);
    }

    return {
      stopped: true,
      stoppedRuns,
      runId: stoppedRuns[0] || runId || null,
      executionToken: executionToken || null
    };
  }

  async executeTest({
    workspaceRoot,
    testId,
    filePath,
    testData,
    executionMode = 'auto',
    sessionId,
    apiBaseUrl,
    approvalId,
    executionToken,
    allowLocalhost = true,
    timeoutMs,
    auth = {},
    onLog,
    onStateChange
  } = {}) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    let targetRecord = null;
    let subject = testData;

    if (testId || filePath) {
      targetRecord = await getWorkspaceTest({ workspaceRoot: root, testId, filePath });
      if (!targetRecord) throw new Error('test_not_found');
      subject = targetRecord.testData;
    }
    if (!subject || !subject.code) {
      throw new Error('test_code_required');
    }

    const runId = `atom-run-${crypto.randomBytes(4).toString('hex')}`;
    const effectiveSessionId = sessionId || `session-${Date.now()}`;
    const specification = normalizeGeneratedTest(subject);
    const policy = this.policyEngine.evaluate(specification, {
      tenantId: auth.tenantId || 'local-tenant',
      userId: auth.devUser || 'atom-ide-user'
    });

    const backendInfo = await this.resolveBackend(apiBaseUrl);
    const backendUrl = backendInfo.url || apiBaseUrl || this.apiBaseUrl;
    let useBackend = executionMode === 'atom-backend';
    if (executionMode === 'auto' && backendInfo.reachable && backendInfo.workerExecutionEnabled) {
      useBackend = true;
    }

    const activeEntry = {
      runId,
      executionToken: executionToken || null,
      cancelled: false,
      childProcess: null,
      backendUrl: backendInfo.reachable ? backendInfo.url : null,
      backendRunId: null,
      auth,
      abortController: typeof AbortController === 'function' ? new AbortController() : null,
      emitLog: null,
      emitState: null
    };
    this.activeExecutions.set(runId, activeEntry);
    if (executionToken) {
      this.activeExecutions.set(executionToken, activeEntry);
    }

    const logs = [];
    let syncedLogsCount = 0;
    let syncChain = Promise.resolve();
    const queueBackendSync = payload => {
      if (!backendInfo.reachable || useBackend || !backendInfo.url) return;
      syncChain = syncChain
        .then(() => this.syncEventToBackend(backendInfo.url, payload, auth))
        .catch(() => false);
    };

    const emitLog = (content, stream = 'stdout') => {
      const entry = { timestamp: new Date().toISOString(), stream, content: String(content) };
      logs.push(entry);
      if (onLog) onLog(entry);
      if (backendInfo.reachable && !useBackend && syncedLogsCount < 50 && !String(entry.content).startsWith('[ATOM Backend Sync]')) {
        syncedLogsCount += 1;
        queueBackendSync({
          event: 'run.log',
          runId,
          log: entry
        });
      }
    };
    const emitState = (state, extra = {}) => {
      if (onStateChange) onStateChange({ state, timestamp: new Date().toISOString(), ...extra });
    };
    activeEntry.emitLog = emitLog;
    activeEntry.emitState = emitState;

    let executionResult;
    try {
      emitState('validated', { runId, executionToken: executionToken || null });
      emitLog(
        `[ATOM Policy Engine] Checked ${specification.id || 'spec'} (${specification.type}). Allowed: ${policy.allowed}${
          policy.reasons.length ? ` [${policy.reasons.join(', ')}]` : ''
        }`
      );

      if (backendInfo.reachable && !useBackend && !UNSAFE_CODE_RE.test(String(subject.code))) {
        emitLog(`[ATOM Backend Sync] Live telemetry connected to ${backendInfo.url}`);
        await this.syncEventToBackend(
          backendInfo.url,
          {
            event: 'run.started',
            runId,
            testData: {
              id: subject.id || targetRecord?.id || null,
              prompt: subject.prompt || targetRecord?.prompt || '',
              testType: subject.testType || specification.type || 'ui',
              savedFile: targetRecord?.relativePath || subject.savedFile || null,
              sessionId: effectiveSessionId
            }
          },
          auth
        );
      }

      if (UNSAFE_CODE_RE.test(String(subject.code))) {
        executionResult = {
          runId,
          status: 'failed',
          runner: 'policy-guard',
          duration: 0,
          exitCode: 1,
          error: 'unsafe_code_pattern_denied',
          summary: { testCount: 0, passedCount: 0, failedCount: 1, skippedCount: 0 },
          logs,
          media: { screenshots: [], videos: [], traces: [] },
          policy,
          savedFile: targetRecord?.relativePath || subject.savedFile || null
        };
      } else if (useBackend) {
        if (!backendUrl) throw new Error('atom_backend_url_not_configured');
        executionResult = await this.executeViaBackend({
          workspaceRoot: root,
          backendUrl,
          subject,
          targetRecord,
          effectiveSessionId,
          approvalId,
          auth,
          policy,
          runId,
          logs,
          emitLog,
          emitState,
          activeEntry
        });
      } else {
        executionResult = await this.executeViaLocalPlaywright({
          workspaceRoot: root,
          subject,
          targetRecord,
          policy,
          allowLocalhost,
          timeoutMs,
          runId,
          logs,
          emitLog,
          emitState,
          activeEntry
        });
      }

      if (backendInfo.reachable && !useBackend && !UNSAFE_CODE_RE.test(String(subject.code))) {
        await syncChain;
        await this.syncEventToBackend(
          backendInfo.url,
          {
            event: 'run.completed',
            runId,
            testData: {
              id: subject.id || targetRecord?.id || null,
              prompt: subject.prompt || targetRecord?.prompt || '',
              testType: subject.testType || specification.type || 'ui',
              savedFile: executionResult.savedFile || targetRecord?.relativePath || subject.savedFile || null
            },
            result: {
              status: executionResult.status,
              runner: executionResult.runner,
              duration: executionResult.duration,
              exitCode: executionResult.exitCode,
              error: executionResult.error || null,
              summary: executionResult.summary,
              savedFile: executionResult.savedFile || null,
              sessionId: effectiveSessionId
            }
          },
          auth
        );
      }
    } finally {
      this.activeExecutions.delete(runId);
      if (executionToken) {
        this.activeExecutions.delete(executionToken);
      }
    }

    try {
      await recordExecutionInAtomDb({
        workspaceRoot: root,
        testData: {
          ...subject,
          specification,
          agent: targetRecord?.agent || subject.agent
        },
        executionResult: { ...executionResult, sessionId: effectiveSessionId },
        tenantId: auth.tenantId || 'local-tenant',
        userId: auth.devUser || 'atom-ide-user',
        atomDbDir: this.atomDbDir
      });
    } catch (_) {
      // Do not fail execution return if optional DB sync fails
    }

    return executionResult;
  }

  async executeViaBackend({
    workspaceRoot,
    backendUrl,
    subject,
    targetRecord,
    effectiveSessionId,
    approvalId,
    auth,
    policy,
    runId,
    logs,
    emitLog,
    emitState,
    activeEntry
  }) {
    const base = backendUrl.replace(/\/+$/, '');
    const headers = {
      ...buildAuthHeaders(auth),
      'Idempotency-Key': `atom-mcp-${crypto.randomUUID()}`,
      ...(approvalId ? { 'X-Approval-Id': approvalId } : {})
    };

    emitState('queued', { runId });
    emitLog(`[ATOM Backend] Submitting execution to ${base}/api/execute/test...`);

    const submission = await fetchJsonWithTimeout(
      `${base}/api/execute/test`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ testData: subject, sessionId: effectiveSessionId })
      },
      5000
    );

    if (!submission.ok) {
      const reason = submission.body?.reason || submission.body?.error || `http_${submission.status}`;
      emitLog(`[ATOM Backend] Execution denied or blocked (${submission.status}): ${reason}`, 'stderr');
      emitState('failed', { runId, reason });
      return {
        runId,
        status: 'failed',
        runner: 'atom-backend',
        duration: 0,
        exitCode: 1,
        error: reason,
        details: submission.body,
        summary: { testCount: 0, passedCount: 0, failedCount: 1, skippedCount: 0 },
        logs,
        media: { screenshots: [], videos: [], traces: [] },
        policy,
        savedFile: targetRecord?.relativePath || subject.savedFile || null
      };
    }

    const remoteRun = submission.body.run;
    const remoteRunId = remoteRun?.id || runId;
    if (activeEntry) {
      activeEntry.backendRunId = remoteRunId;
    }
    emitLog(`[ATOM Backend] Run accepted: ${remoteRunId} (state: ${remoteRun?.state || 'queued'}).`);

    let finalRun = remoteRun;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && !['passed', 'failed', 'cancelled'].includes(finalRun?.state)) {
      if (activeEntry?.cancelled) {
        finalRun = { ...finalRun, state: 'cancelled' };
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (activeEntry?.cancelled) {
        finalRun = { ...finalRun, state: 'cancelled' };
        break;
      }
      const polled = await fetchJsonWithTimeout(`${base}/api/runs/${encodeURIComponent(remoteRunId)}`, { headers }, 3000);
      if (polled.ok && polled.body) {
        if (polled.body.state !== finalRun?.state) {
          emitState(polled.body.state, { runId: remoteRunId });
          emitLog(`[ATOM Backend] Run ${remoteRunId} transitioned to ${polled.body.state}.`);
        }
        finalRun = polled.body;
      }
    }

    const resultObj = finalRun?.result || {};
    const status = activeEntry?.cancelled
      ? 'cancelled'
      : (['passed', 'failed', 'cancelled'].includes(finalRun?.state) ? finalRun.state : 'failed');
    const summary = resultObj.summary || {
      testCount: 1,
      passedCount: status === 'passed' ? 1 : 0,
      failedCount: status === 'passed' ? 0 : (status === 'cancelled' ? 0 : 1),
      skippedCount: status === 'cancelled' ? 1 : 0
    };
    const finalResult = {
      runId: remoteRunId,
      status,
      runner: 'atom-backend',
      duration: resultObj.duration || 0,
      exitCode: status === 'cancelled' ? 130 : (resultObj.exitCode ?? (status === 'passed' ? 0 : 1)),
      ...(status === 'cancelled' ? { error: 'execution_cancelled_by_user' } : {}),
      summary,
      logs,
      media: { screenshots: [], videos: [], traces: [] },
      artifacts: resultObj.artifacts || [],
      policy,
      savedFile: targetRecord?.relativePath || subject.savedFile || null
    };

    if (targetRecord) {
      await updateTestLastRun({
        workspaceRoot,
        testId: targetRecord.id,
        relativePath: targetRecord.relativePath,
        runSummary: { runId: remoteRunId, status, duration: finalResult.duration, timestamp: new Date().toISOString() }
      });
    }
    return finalResult;
  }

  async executeViaLocalPlaywright({
    workspaceRoot,
    subject,
    targetRecord,
    policy,
    allowLocalhost,
    timeoutMs,
    runId,
    logs,
    emitLog,
    emitState,
    activeEntry
  }) {
    if (subject.testType === 'mobile') {
      emitLog('[ATOM Mobile Guard] Native iOS/Android tests require ATOM\'s immutable Appium worker and managed device broker.', 'stderr');
      emitState('failed', { runId, reason: 'mobile_requires_appium_worker' });
      return {
        runId,
        status: 'failed',
        runner: 'local-playwright',
        duration: 0,
        exitCode: 1,
        error: 'mobile_requires_appium_worker',
        remediation: 'Configure APPIUM_EXECUTION_ENABLED=true, APPIUM_WORKER_IMAGE, and managed device broker URLs, then run via ATOM Backend mode.',
        summary: { testCount: 0, passedCount: 0, failedCount: 1, skippedCount: 0 },
        logs,
        media: { screenshots: [], videos: [], traces: [] },
        policy,
        savedFile: targetRecord?.relativePath || subject.savedFile || null
      };
    }

    const blockingReasons = (policy.reasons || []).filter(reason => {
      if (!allowLocalhost) return true;
      return !['target_domain_blocked', 'target_private_address_blocked'].includes(reason);
    });
    if (blockingReasons.length > 0) {
      emitLog(`[ATOM Policy Engine] Execution blocked: ${blockingReasons.join(', ')}`, 'stderr');
      emitState('failed', { runId, reason: blockingReasons[0] });
      return {
        runId,
        status: 'failed',
        runner: 'policy-guard',
        duration: 0,
        exitCode: 1,
        error: `policy_denied:${blockingReasons.join(',')}`,
        summary: { testCount: 0, passedCount: 0, failedCount: 1, skippedCount: 0 },
        logs,
        media: { screenshots: [], videos: [], traces: [] },
        policy,
        savedFile: targetRecord?.relativePath || subject.savedFile || null
      };
    }

    const playwrightCli = resolvePlaywrightCli(workspaceRoot);
    if (!playwrightCli) {
      emitLog('[ATOM Local Runner] @playwright/test CLI could not be located.', 'stderr');
      emitState('failed', { runId, reason: 'playwright_not_installed' });
      return {
        runId,
        status: 'failed',
        runner: 'local-playwright',
        duration: 0,
        exitCode: 1,
        error: 'playwright_not_installed',
        remediation: 'Install @playwright/test and run: npx playwright install chromium',
        summary: { testCount: 0, passedCount: 0, failedCount: 1, skippedCount: 0 },
        logs,
        media: { screenshots: [], videos: [], traces: [] },
        policy,
        savedFile: targetRecord?.relativePath || subject.savedFile || null
      };
    }

    const { runsDir } = getStatePaths(workspaceRoot);
    const runDir = path.join(runsDir, runId);
    const artifactsDir = path.join(runDir, 'artifacts');
    const mediaOutDir = path.join(runDir, 'media');
    await fs.ensureDir(artifactsDir);

    let testFilePath = targetRecord?.filePath;
    if (!testFilePath) {
      testFilePath = path.join(runDir, `${subject.id || 'adhoc'}.spec.ts`);
      await fs.writeFile(testFilePath, String(subject.code), 'utf8');
    } else {
      testFilePath = resolvePathInsideWorkspace(workspaceRoot, testFilePath);
    }

    const browser = subject.mcpConfig?.browser || 'chromium';
    const effectiveTimeout = Number(timeoutMs || subject.mcpConfig?.timeout || 30000);
    const configPath = path.join(runDir, 'playwright.atom.config.cjs');
    const resolvePreloadPath = path.join(runDir, 'resolve-playwright.cjs');
    const reportPath = path.join(runDir, 'results.json');
    const testDir = path.dirname(testFilePath);
    const testBase = path.basename(testFilePath);
    const escapedTestBase = testBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const playwrightNodeModules = path.dirname(path.dirname(path.dirname(playwrightCli)));

    const resolvePreloadSource = `const Module = require('node:module');
const pwModulesDir = ${JSON.stringify(playwrightNodeModules)};
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
`;
    await fs.writeFile(resolvePreloadPath, resolvePreloadSource, 'utf8');

    const playwrightConfigSource = `module.exports = {
  testDir: ${JSON.stringify(testDir)},
  testMatch: new RegExp(${JSON.stringify(`(?:^|[\\\\/])${escapedTestBase}$`)}),
  timeout: ${effectiveTimeout},
  retries: ${Number(subject.mcpConfig?.retries ?? 0)},
  workers: 1,
  outputDir: ${JSON.stringify(artifactsDir)},
  use: {
    browserName: ${JSON.stringify(browser)},
    headless: ${subject.mcpConfig?.headless !== false},
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    viewport: ${JSON.stringify(subject.mcpConfig?.viewport || { width: 1280, height: 720 })}
  },
  reporter: [
    ['json', { outputFile: ${JSON.stringify(reportPath)} }],
    ['line']
  ]
};
`;
    await fs.writeFile(configPath, playwrightConfigSource, 'utf8');

    const packageNodeModules = path.resolve(__dirname, '..', '..', 'node_modules');
    const workspaceNodeModules = path.join(workspaceRoot, 'node_modules');
    const nodePathParts = [workspaceNodeModules, packageNodeModules, process.env.NODE_PATH].filter(Boolean);
    const relativePreload = `./${path.relative(workspaceRoot, resolvePreloadPath).replace(/\\/g, '/')}`;
    const existingNodeOptions = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
    const nodeOptions = !/\s/.test(relativePreload)
      ? `${existingNodeOptions}-r ${relativePreload}`
      : process.env.NODE_OPTIONS;
    const env = {
      ...process.env,
      NODE_PATH: nodePathParts.join(path.delimiter),
      ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
      CI: 'true'
    };

    const relativeSpecArg = path.relative(workspaceRoot, testFilePath).replace(/\\/g, '/');
    const args = [playwrightCli, 'test', '--config', configPath];

    emitState('running', { runId, executionToken: activeEntry?.executionToken || null });
    emitLog(`[Worker Mesh] Starting Local Playwright (${browser}) on ${relativeSpecArg}...`);

    const startedAt = Date.now();
    const exitCode = activeEntry?.cancelled
      ? 130
      : await new Promise(resolve => {
          const child = spawn(process.execPath, args, {
            cwd: workspaceRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false
          });

          if (activeEntry) {
            activeEntry.childProcess = child;
          }

          const timer = setTimeout(() => {
            emitLog('[Runner] Execution timed out; terminating Playwright process.', 'stderr');
            try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
          }, effectiveTimeout + 15000);

          if (activeEntry?.cancelled) {
            try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
          }

          child.stdout.on('data', chunk => emitLog(chunk.toString(), 'stdout'));
          child.stderr.on('data', chunk => emitLog(chunk.toString(), 'stderr'));
          child.on('error', err => {
            clearTimeout(timer);
            emitLog(`[Runner] Spawn failed: ${err.message}`, 'stderr');
            resolve(1);
          });
          child.on('close', code => {
            clearTimeout(timer);
            if (activeEntry && activeEntry.childProcess === child) {
              activeEntry.childProcess = null;
            }
            resolve(typeof code === 'number' ? code : (activeEntry?.cancelled ? 130 : 1));
          });
        });

    const duration = Date.now() - startedAt;
    let reportJson = null;
    if (await fs.pathExists(reportPath)) {
      try {
        reportJson = await fs.readJson(reportPath);
      } catch (_) {
        reportJson = null;
      }
    }

    const summary = parsePlaywrightSummary(reportJson, exitCode);
    emitState('collecting_artifacts', { runId, executionToken: activeEntry?.executionToken || null });
    const media = await collectMediaFiles(artifactsDir, mediaOutDir, workspaceRoot);
    const status = activeEntry?.cancelled ? 'cancelled' : (exitCode === 0 ? 'passed' : 'failed');

    const fullLogText = logs.map(l => l.content).join('\n');
    let remediation = null;
    if (status === 'failed' && /Executable doesn't exist|npx playwright install/i.test(fullLogText)) {
      remediation = 'Playwright browser binaries are not installed yet. Run: npx playwright install chromium';
    }

    emitLog(`[Completed] Run ${runId} ${status.toUpperCase()} in ${(duration / 1000).toFixed(1)}s (passed=${summary.passedCount}, failed=${summary.failedCount}).`);
    emitState(status, { runId, executionToken: activeEntry?.executionToken || null });

    const finalResult = {
      runId,
      status,
      runner: 'local-playwright',
      duration,
      exitCode,
      ...(status === 'cancelled' ? { error: 'execution_cancelled_by_user' } : {}),
      summary,
      logs,
      media,
      remediation,
      policy,
      savedFile: targetRecord?.relativePath || subject.savedFile || path.relative(workspaceRoot, testFilePath).replace(/\\/g, '/'),
      testName: testBase
    };

    if (targetRecord) {
      await updateTestLastRun({
        workspaceRoot,
        testId: targetRecord.id,
        relativePath: targetRecord.relativePath,
        runSummary: {
          runId,
          status,
          duration,
          summary,
          media,
          timestamp: new Date().toISOString()
        }
      });
    }

    return finalResult;
  }

  async inspectPulseGaps({ workspaceRoot, apiBaseUrl, limit = 10, auth = {} } = {}) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    const backendUrl = apiBaseUrl || this.apiBaseUrl;
    if (backendUrl) {
      try {
        const base = backendUrl.replace(/\/+$/, '');
        const [gapsRes, sumRes] = await Promise.all([
          fetchJsonWithTimeout(`${base}/api/pulse/gaps?limit=${limit}`, { headers: buildAuthHeaders(auth) }, 1500),
          fetchJsonWithTimeout(`${base}/api/pulse/summary`, { headers: buildAuthHeaders(auth) }, 1500)
        ]);
        if (gapsRes.ok && sumRes.ok) {
          return { source: 'atom-backend', gaps: gapsRes.body, summary: sumRes.body };
        }
      } catch (_) {
        // Fall through to local Pulse data
      }
    }

    const candidates = [
      path.join(root, 'data', 'pulse', 'pulse.json'),
      path.resolve(__dirname, '..', '..', 'data', 'pulse', 'pulse.json')
    ];
    const pulseFile = candidates.find(candidate => fs.existsSync(candidate)) || path.join(root, '.atom', 'pulse.json');
    const pulse = new PulseService({ filePath: pulseFile });
    const tests = await listWorkspaceTests({ workspaceRoot: root });
    const specs = [];
    for (const item of tests) {
      const loaded = await getWorkspaceTest({ workspaceRoot: root, testId: item.id });
      if (loaded) {
        specs.push({
          purpose: loaded.prompt,
          code: loaded.code,
          target: { url: '' }
        });
      }
    }
    return {
      source: 'local-pulse',
      gaps: pulse.gaps(auth.tenantId || 'local-tenant', specs, { limit }),
      summary: pulse.summarize(auth.tenantId || 'local-tenant', specs)
    };
  }

  async runAgentTask({
    workspaceRoot,
    agent = 'ui-agent',
    task,
    prompt,
    testType,
    folder,
    filename,
    overwrite = false,
    options = {},
    llm = {},
    testId,
    filePath,
    executionMode = 'auto',
    apiBaseUrl,
    approvalId,
    executionToken,
    auth = {},
    onLog,
    onStateChange
  } = {}) {
    const root = this.getWorkspaceRoot(workspaceRoot);
    const resolved = resolveAgentAndTask(agent, task);
    const taskId = resolved.task.id;

    if (taskId === 'list_tests') {
      const tests = await listWorkspaceTests({ workspaceRoot: root, folder, testType });
      return { agent: resolved.agent, task: resolved.task, tests };
    }

    if (taskId === 'pulse_gaps') {
      const pulseReport = await this.inspectPulseGaps({ workspaceRoot: root, apiBaseUrl, auth });
      return { agent: resolved.agent, task: resolved.task, pulse: pulseReport };
    }

    if (taskId === 'policy_audit') {
      let generated = null;
      if (!testId && !filePath && prompt) {
        generated = await this.generateTest({
          workspaceRoot: root,
          prompt,
          testType,
          folder,
          filename,
          overwrite,
          agent: resolved.agent.id,
          task: taskId,
          options,
          llm,
          save: true,
          apiBaseUrl,
          auth
        });
      }
      const audit = await this.auditPolicy({
        workspaceRoot: root,
        testId: testId || generated?.test?.id,
        filePath: filePath || generated?.saved?.relativePath,
        testData: generated?.test
      });
      return {
        agent: resolved.agent,
        task: resolved.task,
        ...(generated || {}),
        audit
      };
    }

    if (taskId === 'execute_test') {
      const execution = await this.executeTest({
        workspaceRoot: root,
        testId,
        filePath,
        executionMode,
        apiBaseUrl,
        approvalId,
        executionToken,
        auth,
        onLog,
        onStateChange
      });
      const loaded = (testId || filePath)
        ? await getWorkspaceTest({ workspaceRoot: root, testId, filePath })
        : null;
      return {
        agent: resolved.agent,
        task: resolved.task,
        test: loaded?.testData || null,
        saved: loaded ? { folder: loaded.folder, filePath: loaded.filePath, relativePath: loaded.relativePath } : null,
        execution
      };
    }

    if (taskId === 'generate_and_run') {
      const generated = await this.generateTest({
        workspaceRoot: root,
        prompt,
        testType,
        folder,
        filename,
        overwrite,
        agent: resolved.agent.id,
        task: taskId,
        options,
        llm,
        save: true,
        apiBaseUrl,
        auth
      });
      const execution = await this.executeTest({
        workspaceRoot: root,
        testId: generated.test.id,
        filePath: generated.saved.relativePath,
        testData: generated.test,
        executionMode,
        apiBaseUrl,
        approvalId,
        executionToken,
        auth,
        onLog,
        onStateChange
      });
      return {
        ...generated,
        execution
      };
    }

    // Default: generate_and_save
    return this.generateTest({
      workspaceRoot: root,
      prompt,
      testType,
      folder,
      filename,
      overwrite,
      agent: resolved.agent.id,
      task: taskId,
      options,
      llm,
      save: true,
      apiBaseUrl,
      auth
    });
  }
}

module.exports = {
  AtomWorkspaceEngine,
  normalizeTargetUrl,
  applyTargetUrlToCode,
  resolvePlaywrightCli,
  parsePlaywrightSummary
};
