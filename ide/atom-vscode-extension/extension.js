const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');

function findExecutableOnPath(names) {
  const pathDirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveNodeExecutable() {
  const names = process.platform === 'win32' ? ['node.exe', 'node.cmd'] : ['node'];
  const onPath = findExecutableOnPath(names);
  if (onPath) return { command: onPath, extraEnv: {} };
  return { command: process.execPath, extraEnv: { ELECTRON_RUN_AS_NODE: '1' } };
}

function readRecordedRuntime() {
  try {
    const file = path.join(os.homedir(), '.atom', 'runtime.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {
    // ignore malformed runtime manifest
  }
  return null;
}

function resolveAtomMcpLaunch(workspaceRoot, extensionPath) {
  const cfg = vscode.workspace.getConfiguration('atom');
  const configuredPath = cfg.get('mcpServerPath');
  const apiBaseUrl = cfg.get('apiBaseUrl') || '';
  const candidates = [
    configuredPath,
    workspaceRoot ? path.join(workspaceRoot, 'node_modules', '@atomworld', 'atom', 'bin', 'atom-mcp.js') : null,
    workspaceRoot ? path.join(workspaceRoot, 'bin', 'atom-mcp.js') : null,
    readRecordedRuntime()?.mcpEntry,
    path.resolve(extensionPath, '..', '..', 'bin', 'atom-mcp.js')
  ].filter(Boolean);

  const scriptPath = candidates.find(candidate => fs.existsSync(candidate));
  if (scriptPath) {
    const nodeExec = resolveNodeExecutable();
    const args = [scriptPath, '--workspace', workspaceRoot || process.cwd()];
    if (apiBaseUrl) args.push('--api-url', apiBaseUrl);
    return {
      command: nodeExec.command,
      args,
      extraEnv: nodeExec.extraEnv,
      mode: 'node-script',
      scriptPath
    };
  }

  const globalBin = findExecutableOnPath(process.platform === 'win32' ? ['atom-mcp.cmd', 'atom-mcp'] : ['atom-mcp']);
  if (globalBin) {
    const args = ['--workspace', workspaceRoot || process.cwd()];
    if (apiBaseUrl) args.push('--api-url', apiBaseUrl);
    return {
      command: globalBin,
      args,
      extraEnv: {},
      mode: 'global-bin',
      scriptPath: globalBin
    };
  }

  return null;
}

class AtomMcpClient {
  constructor(extensionPath, outputChannel) {
    this.extensionPath = extensionPath;
    this.output = outputChannel;
    this.proc = null;
    this.rl = null;
    this.nextId = 1;
    this.pending = new Map();
    this.notificationListeners = new Set();
    this.initializedWorkspace = null;
    this.serverInfo = null;
  }

  onNotification(listener) {
    if (typeof listener !== 'function') return () => {};
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  getWorkspaceRoot() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.uri.fsPath : process.cwd();
  }

  async ensureConnected(workspaceRoot = this.getWorkspaceRoot()) {
    if (this.proc && !this.proc.killed && this.initializedWorkspace === workspaceRoot) {
      return this.serverInfo;
    }
    this.dispose();

    const launch = resolveAtomMcpLaunch(workspaceRoot, this.extensionPath);
    if (!launch) {
      throw new Error('Atom MCP server entrypoint not found. Install @atomworld/atom (`npm install -g @atomworld/atom`) or set `atom.mcpServerPath` in settings.');
    }

    const env = {
      ...process.env,
      ...launch.extraEnv
    };

    const useCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.command);
    if (useCmdShim) {
      const comspec = process.env.ComSpec || 'cmd.exe';
      const quoteCmdArg = val => `"${String(val).replace(/"/g, '""')}"`;
      const cmdLine = `"${[launch.command, ...launch.args].map(quoteCmdArg).join(' ')}"`;
      this.proc = spawn(comspec, ['/d', '/s', '/c', cmdLine], {
        cwd: workspaceRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsVerbatimArguments: true
      });
    } else {
      this.proc = spawn(launch.command, launch.args, {
        cwd: workspaceRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });
    }
    this.initializedWorkspace = workspaceRoot;

    this.rl = readline.createInterface({ input: this.proc.stdout, terminal: false });
    this.rl.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch (_) {
        this.output.appendLine(`[Atom MCP stdout non-JSON] ${trimmed}`);
        return;
      }
      if (msg.id !== undefined && msg.id !== null && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(new Error(msg.error.message || 'MCP error'));
        } else {
          entry.resolve(msg.result);
        }
      } else if (msg.method) {
        for (const listener of this.notificationListeners) {
          try {
            listener(msg);
          } catch (_) {
            // ignore listener failure
          }
        }
      }
    });

    this.proc.stderr.on('data', chunk => {
      this.output.appendLine(chunk.toString().trimEnd());
    });

    this.proc.on('exit', code => {
      this.output.appendLine(`[Atom MCP] exited with code ${code}`);
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Atom MCP server exited (${code})`));
      }
      this.pending.clear();
      this.proc = null;
      this.rl = null;
      this.initializedWorkspace = null;
    });

    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'atom-vscode-extension', version: '1.0.5' }
    }, 10000);

    this.sendNotification('notifications/initialized');
    this.serverInfo = {
      ...initResult?.serverInfo,
      protocolVersion: initResult?.protocolVersion,
      launchMode: launch.mode,
      scriptPath: launch.scriptPath
    };
    return this.serverInfo;
  }

  sendNotification(method, params = {}) {
    if (!this.proc || !this.proc.stdin.writable) return;
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  sendRequest(method, params = {}, timeoutMs = 120000) {
    if (!this.proc || !this.proc.stdin.writable) {
      return Promise.reject(new Error('Atom MCP server process is not running'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async callTool(name, args = {}, timeoutMs = 180000) {
    const workspaceRoot = args.workspaceRoot || this.getWorkspaceRoot();
    await this.ensureConnected(workspaceRoot);
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: { ...args, workspaceRoot }
    }, timeoutMs);

    if (result?.structuredContent) {
      if (result.isError && result.structuredContent.error) {
        const err = new Error(result.structuredContent.error);
        err.payload = result.structuredContent;
        throw err;
      }
      return result.structuredContent;
    }

    const textItem = Array.isArray(result?.content) ? result.content.find(c => c.type === 'text') : null;
    const parsed = textItem ? JSON.parse(textItem.text) : {};
    if (result?.isError) {
      throw new Error(parsed?.error || 'MCP tool call failed');
    }
    return parsed;
  }

  dispose() {
    if (this.rl) {
      try { this.rl.close(); } catch (_) {}
      this.rl = null;
    }
    if (this.proc) {
      try { this.proc.kill(); } catch (_) {}
      this.proc = null;
    }
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Atom MCP client disposed'));
    }
    this.pending.clear();
    this.initializedWorkspace = null;
  }
}

function mapMediaForWebview(media, webview) {
  if (!media) return { screenshots: [], videos: [], traces: [] };
  const mapList = items => (Array.isArray(items) ? items : []).map(item => ({
    ...item,
    webviewUri: item.filePath ? webview.asWebviewUri(vscode.Uri.file(item.filePath)).toString() : null
  }));
  return {
    screenshots: mapList(media.screenshots),
    videos: mapList(media.videos),
    traces: mapList(media.traces)
  };
}

const LLM_CONFIG_STATE_KEY = 'atom.llm.config';
const LLM_PROVIDER_IDS = ['openai', 'anthropic', 'google'];
const AGENT_DEFAULT_TEST_TYPE = {
  'ui-agent': 'ui',
  'mobile-agent': 'mobile',
  'api-agent': 'api',
  'visual-agent': 'visual',
  'mixed-agent': 'mixed',
  'atom-qa': 'ui'
};

function detectLlmProviderFromKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('sk-')) return 'openai';
  return null;
}

function maskApiKey(apiKey) {
  const clean = String(apiKey || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 5)}…${clean.slice(-4)}`;
}

class AtomWorkspaceController {
  constructor(context, mcpClient, outputChannel) {
    this.context = context;
    this.mcpClient = mcpClient;
    this.output = outputChannel;
    this.surfaces = new Set();
    this.activeExecutions = new Map();
    this.mcpClient.onNotification(msg => this.handleMcpNotification(msg));
  }

  handleMcpNotification(msg) {
    if (!msg || !msg.method) return;
    if (msg.method === 'notifications/atom.executionLog') {
      const params = msg.params || {};
      if (params.content) {
        this.output.appendLine(String(params.content).trimEnd());
      }
      this.broadcast({ type: 'mcpExecutionLog', payload: params });
    } else if (msg.method === 'notifications/atom.executionState') {
      this.broadcast({ type: 'mcpExecutionState', payload: msg.params || {} });
    }
  }

  registerSurface(webview) {
    this.surfaces.add(webview);
  }

  unregisterSurface(webview) {
    this.surfaces.delete(webview);
  }

  broadcast(message) {
    for (const webview of this.surfaces) {
      try {
        webview.postMessage(message);
      } catch (_) {
        // ignore disposed webviews
      }
    }
  }

  getActiveEditorContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const workspaceRoot = this.mcpClient.getWorkspaceRoot();
    const fsPath = editor.document.uri.fsPath;
    const relativePath = path.relative(workspaceRoot, fsPath).replace(/\\/g, '/');
    const selection = editor.document.getText(editor.selection).trim();
    return {
      relativePath,
      languageId: editor.document.languageId,
      selection: selection ? selection.slice(0, 600) : ''
    };
  }

  getWebviewOptions() {
    const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri);
    return {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri, ...workspaceRoots]
    };
  }

  async getStoredApiKey(provider) {
    if (!LLM_PROVIDER_IDS.includes(provider) || !this.context.secrets) return '';
    const secret = await this.context.secrets.get(`atom.llm.apiKey.${provider}`);
    return String(secret || '').trim();
  }

  async getLlmState() {
    const saved = this.context.globalState?.get(LLM_CONFIG_STATE_KEY) || {};
    const configuredProviders = {};
    const maskedKeys = {};

    for (const providerId of LLM_PROVIDER_IDS) {
      const secret = await this.getStoredApiKey(providerId);
      configuredProviders[providerId] = Boolean(secret);
      maskedKeys[providerId] = maskApiKey(secret);
    }

    let provider = String(saved.provider || '').toLowerCase().trim();
    if (!provider || provider === 'fallback') {
      provider = LLM_PROVIDER_IDS.find(id => configuredProviders[id]) || 'free';
    }

    const hasKey = Boolean(LLM_PROVIDER_IDS.includes(provider) && configuredProviders[provider]);
    return {
      provider,
      model: String(saved.model || '').trim(),
      hasKey,
      maskedKey: maskedKeys[provider] || '',
      configuredProviders,
      maskedKeys
    };
  }

  async saveLlmConfig({ provider, model, apiKey } = {}) {
    const cleanKey = String(apiKey || '').trim();
    const detected = detectLlmProviderFromKey(cleanKey);
    let nextProvider = String(provider || '').toLowerCase().trim();
    if (!nextProvider || nextProvider === 'auto') {
      nextProvider = detected || (cleanKey ? 'openai' : 'free');
    }

    if (cleanKey && LLM_PROVIDER_IDS.includes(nextProvider) && this.context.secrets) {
      await this.context.secrets.store(`atom.llm.apiKey.${nextProvider}`, cleanKey);
    }

    await this.context.globalState?.update(LLM_CONFIG_STATE_KEY, {
      provider: nextProvider,
      model: String(model || '').trim()
    });

    return this.getLlmState();
  }

  async clearLlmKey({ provider } = {}) {
    const saved = this.context.globalState?.get(LLM_CONFIG_STATE_KEY) || {};
    const target = LLM_PROVIDER_IDS.includes(provider) ? provider : String(saved.provider || '').toLowerCase();
    if (LLM_PROVIDER_IDS.includes(target) && this.context.secrets) {
      await this.context.secrets.delete(`atom.llm.apiKey.${target}`);
      if (saved.provider === target) {
        await this.context.globalState?.update(LLM_CONFIG_STATE_KEY, {
          provider: 'free',
          model: ''
        });
      }
    }
    return this.getLlmState();
  }

  async resolveRequestLlm(payloadLlm) {
    if (payloadLlm && (payloadLlm.apiKey || payloadLlm.provider || payloadLlm.model)) {
      await this.saveLlmConfig(payloadLlm);
    }
    const state = await this.getLlmState();
    const apiKey = await this.getStoredApiKey(state.provider);
    return {
      state,
      llm: {
        provider: state.provider,
        ...(state.model ? { model: state.model } : {}),
        ...(apiKey ? { apiKey } : {})
      }
    };
  }

  buildPromptWithActiveContext(rawPrompt, includeActiveFile) {
    let prompt = String(rawPrompt || '').trim();
    if (includeActiveFile && prompt) {
      const active = this.getActiveEditorContext();
      if (active) {
        prompt += `\n\nActive IDE context file: ${active.relativePath}`;
        if (active.selection) {
          prompt += `\nSelected code:\n${active.selection}`;
        }
      }
    }
    return prompt;
  }

  buildTaskOptions(payload, resolvedTestType) {
    return {
      ...(payload.browser ? { browser: payload.browser } : {}),
      ...(payload.targetUrl ? { targetUrl: payload.targetUrl } : {}),
      ...(resolvedTestType === 'mobile'
        ? {
            mobile: {
              platform: payload.mobilePlatform || 'android',
              ...(payload.mobileDeviceName ? { deviceName: payload.mobileDeviceName } : {})
            }
          }
        : {})
    };
  }

  getWebviewHtml(webview) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const htmlPath = path.join(this.context.extensionPath, 'webview', 'index.html');
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'styles.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'main.js'));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'atom-logo.png'));
    const heroUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'atom-hero.jpg'));

    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html
      .replace(/\{\{cspSource\}\}/g, webview.cspSource)
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{cssUri\}\}/g, cssUri.toString())
      .replace(/\{\{jsUri\}\}/g, jsUri.toString())
      .replace(/\{\{logoUri\}\}/g, logoUri.toString())
      .replace(/\{\{heroUri\}\}/g, heroUri.toString());
    return html;
  }

  async sendInitialState(webview) {
    const cfg = vscode.workspace.getConfiguration('atom');
    const llmState = await this.getLlmState();
    try {
      const serverInfo = await this.mcpClient.ensureConnected();
      const [capabilities, listed] = await Promise.all([
        this.mcpClient.callTool('atom_list_agents'),
        this.mcpClient.callTool('atom_list_tests')
      ]);

      webview.postMessage({
        type: 'stateInit',
        payload: {
          connected: true,
          serverInfo,
          capabilities,
          tests: listed.tests || [],
          activeFile: this.getActiveEditorContext(),
          llmState,
          settings: {
            defaultFolder: cfg.get('defaultFolder') || 'atom',
            defaultAgent: cfg.get('defaultAgent') || 'ui-agent',
            executionMode: cfg.get('executionMode') || 'auto',
            apiBaseUrl: cfg.get('apiBaseUrl') || ''
          }
        }
      });
    } catch (error) {
      webview.postMessage({
        type: 'stateInit',
        payload: {
          connected: false,
          error: error.message,
          activeFile: this.getActiveEditorContext(),
          llmState,
          settings: {
            defaultFolder: cfg.get('defaultFolder') || 'atom',
            defaultAgent: cfg.get('defaultAgent') || 'ui-agent',
            executionMode: cfg.get('executionMode') || 'auto',
            apiBaseUrl: cfg.get('apiBaseUrl') || ''
          }
        }
      });
    }
  }

  async refreshTests() {
    try {
      const listed = await this.mcpClient.callTool('atom_list_tests');
      this.broadcast({ type: 'testsUpdated', payload: { tests: listed.tests || [] } });
    } catch (error) {
      this.broadcast({ type: 'error', payload: { message: error.message } });
    }
  }

  async handleMessage(webview, message) {
    if (!message || !message.type) return;
    const cfg = vscode.workspace.getConfiguration('atom');

    try {
      switch (message.type) {
        case 'ready':
        case 'refresh': {
          await this.sendInitialState(webview);
          break;
        }

        case 'generateTest': {
          const payload = message.payload || {};
          const agent = payload.agent || cfg.get('defaultAgent') || 'ui-agent';
          const resolvedTestType = payload.testType || AGENT_DEFAULT_TEST_TYPE[agent] || 'ui';
          const prompt = this.buildPromptWithActiveContext(payload.prompt, payload.includeActiveFile);
          const { state: llmState, llm } = await this.resolveRequestLlm(payload.llm);

          const created = await this.mcpClient.callTool('atom_create_test', {
            agent,
            prompt,
            testType: resolvedTestType,
            folder: String(payload.folder || '').trim(),
            overwrite: Boolean(payload.overwrite),
            browser: payload.browser || undefined,
            targetUrl: payload.targetUrl || undefined,
            mobilePlatform: resolvedTestType === 'mobile' ? (payload.mobilePlatform || 'android') : undefined,
            mobileDeviceName: resolvedTestType === 'mobile' ? (payload.mobileDeviceName || undefined) : undefined,
            llm
          });

          const listed = await this.mcpClient.callTool('atom_list_tests');
          webview.postMessage({
            type: 'generationCompleted',
            payload: {
              created,
              llmState,
              tests: listed.tests || []
            }
          });
          break;
        }

        case 'saveLlmConfig': {
          const llmState = await this.saveLlmConfig(message.payload || {});
          webview.postMessage({ type: 'llmStateUpdated', payload: llmState });
          break;
        }

        case 'clearLlmKey': {
          const llmState = await this.clearLlmKey(message.payload || {});
          webview.postMessage({ type: 'llmStateUpdated', payload: llmState });
          break;
        }

        case 'pickTestDir': {
          const workspaceRoot = this.mcpClient.getWorkspaceRoot();
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(workspaceRoot),
            openLabel: 'Select Test Directory'
          });
          if (!selected || !selected[0]) break;

          const pickedPath = selected[0].fsPath;
          const rel = path.relative(workspaceRoot, pickedPath);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            vscode.window.showWarningMessage(
              `Selected directory must be inside workspace "${workspaceRoot}". Keeping your current Test Dir.`
            );
            break;
          }

          const folder = rel ? rel.replace(/\\/g, '/') : 'atom';
          webview.postMessage({ type: 'testDirPicked', payload: { folder } });
          break;
        }

        case 'runTask': {
          const payload = message.payload || {};
          const agent = payload.agent || cfg.get('defaultAgent') || 'ui-agent';
          const resolvedTestType = payload.testType || AGENT_DEFAULT_TEST_TYPE[agent] || 'ui';
          const prompt = this.buildPromptWithActiveContext(payload.prompt, payload.includeActiveFile);
          const options = this.buildTaskOptions(payload, resolvedTestType);
          const { llm } = await this.resolveRequestLlm(payload.llm);
          const taskName = payload.task || 'generate_and_save';
          const executionToken = (taskName === 'execute_test' || taskName === 'generate_and_run')
            ? (payload.executionToken || `exec-${crypto.randomBytes(4).toString('hex')}`)
            : undefined;

          if (executionToken) {
            this.activeExecutions.set(executionToken, { testId: payload.testId || null, filePath: payload.filePath || null });
            webview.postMessage({
              type: 'executionStarted',
              payload: { executionToken, testId: payload.testId || null, filePath: payload.filePath || null }
            });
          }

          let result;
          try {
            result = await this.mcpClient.callTool('atom_run_task', {
              agent,
              task: taskName,
              prompt,
              testType: resolvedTestType,
              folder: payload.folder || '',
              overwrite: Boolean(payload.overwrite),
              testId: payload.testId || undefined,
              filePath: payload.filePath || undefined,
              executionMode: payload.executionMode || cfg.get('executionMode') || 'auto',
              executionToken,
              options,
              llm
            });
          } finally {
            if (executionToken) {
              this.activeExecutions.delete(executionToken);
            }
          }

          if (result.execution?.media) {
            result.execution.media = mapMediaForWebview(result.execution.media, webview);
          }

          const listed = await this.mcpClient.callTool('atom_list_tests');
          webview.postMessage({
            type: 'taskCompleted',
            payload: {
              executionToken: executionToken || null,
              result,
              tests: listed.tests || []
            }
          });
          break;
        }

        case 'executeTest': {
          const payload = message.payload || {};
          const executionToken = payload.executionToken || `exec-${crypto.randomBytes(4).toString('hex')}`;
          this.activeExecutions.set(executionToken, { testId: payload.testId || null, filePath: payload.filePath || null });
          webview.postMessage({
            type: 'executionStarted',
            payload: { executionToken, testId: payload.testId || null, filePath: payload.filePath || null }
          });

          let execution;
          try {
            execution = await this.mcpClient.callTool('atom_execute_test', {
              testId: payload.testId,
              filePath: payload.filePath,
              executionMode: payload.executionMode || cfg.get('executionMode') || 'auto',
              executionToken
            });
          } finally {
            this.activeExecutions.delete(executionToken);
          }
          if (execution.media) {
            execution.media = mapMediaForWebview(execution.media, webview);
          }
          const listed = await this.mcpClient.callTool('atom_list_tests');
          webview.postMessage({
            type: 'executionCompleted',
            payload: {
              executionToken,
              testId: payload.testId || null,
              execution,
              tests: listed.tests || []
            }
          });
          break;
        }

        case 'stopExecution': {
          const payload = message.payload || {};
          this.mcpClient.sendNotification('notifications/cancelled', {
            executionToken: payload.executionToken || undefined,
            runId: payload.runId || undefined
          });
          let stopResult = null;
          try {
            stopResult = await this.mcpClient.callTool('atom_stop_execution', {
              executionToken: payload.executionToken || undefined,
              runId: payload.runId || undefined
            }, 5000);
          } catch (_) {
            stopResult = { stopped: false };
          }
          this.broadcast({
            type: 'executionStopping',
            payload: {
              executionToken: payload.executionToken || null,
              runId: payload.runId || null,
              stopResult
            }
          });
          break;
        }

        case 'loadTest': {
          const { testId, filePath } = message.payload || {};
          const loaded = await this.mcpClient.callTool('atom_read_test', { testId, filePath });
          if (loaded?.lastRun?.media) {
            loaded.lastRun.media = mapMediaForWebview(loaded.lastRun.media, webview);
          }
          webview.postMessage({ type: 'testLoaded', payload: loaded });
          break;
        }

        case 'deleteTest': {
          const { testId, filePath, name } = message.payload || {};
          const confirm = await vscode.window.showWarningMessage(
            `Delete test "${name || filePath || testId}" from the workspace?`,
            { modal: true },
            'Delete'
          );
          if (confirm !== 'Delete') return;
          await this.mcpClient.callTool('atom_delete_test', { testId, filePath });
          const listed = await this.mcpClient.callTool('atom_list_tests');
          webview.postMessage({ type: 'testDeleted', payload: { testId, tests: listed.tests || [] } });
          break;
        }

        case 'auditPolicy': {
          const { testId, filePath } = message.payload || {};
          const audit = await this.mcpClient.callTool('atom_policy_audit', { testId, filePath });
          webview.postMessage({ type: 'policyAudited', payload: audit });
          break;
        }

        case 'inspectPulse': {
          const pulse = await this.mcpClient.callTool('atom_pulse_gaps', { limit: 8 });
          webview.postMessage({ type: 'pulseLoaded', payload: pulse });
          break;
        }

        case 'openFile': {
          const target = message.payload?.filePath;
          if (!target) return;
          const workspaceRoot = this.mcpClient.getWorkspaceRoot();
          const resolved = path.isAbsolute(target) ? target : path.resolve(workspaceRoot, target);
          if (fs.existsSync(resolved)) {
            const uri = vscode.Uri.file(resolved);
            if (/\.(png|jpg|jpeg|webp|gif|webm|mp4)$/i.test(resolved)) {
              await vscode.commands.executeCommand('vscode.open', uri);
            } else {
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
            }
          } else {
            vscode.window.showWarningMessage(`File not found: ${resolved}`);
          }
          break;
        }

        case 'copyCode': {
          const code = String(message.payload?.code || '');
          if (code) {
            await vscode.env.clipboard.writeText(code);
            vscode.window.showInformationMessage('Copied generated test code to clipboard.');
          }
          break;
        }

        case 'configureMcp': {
          await vscode.commands.executeCommand('atom.configureMcp');
          break;
        }

        case 'openSplit': {
          await vscode.commands.executeCommand('atom.openBesideEditor');
          break;
        }

        case 'newWindow': {
          await vscode.commands.executeCommand('atom.openNewWindow');
          break;
        }
      }
    } catch (error) {
      this.output.appendLine(`[ATOM Extension Error] ${error.message}`);
      webview.postMessage({
        type: 'error',
        payload: {
          message: error.message,
          details: error.payload || null
        }
      });
    }
  }
}

class AtomSidebarViewProvider {
  constructor(controller) {
    this.controller = controller;
    this.view = null;
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    const { webview } = webviewView;
    webview.options = this.controller.getWebviewOptions();
    webview.html = this.controller.getWebviewHtml(webview);

    this.controller.registerSurface(webview);
    webview.onDidReceiveMessage(msg => this.controller.handleMessage(webview, msg));
    webviewView.onDidDispose(() => {
      this.controller.unregisterSurface(webview);
      this.view = null;
    });
  }

  postMessage(msg) {
    if (this.view) {
      this.view.webview.postMessage(msg);
    }
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel('ATOM World');
  const mcpClient = new AtomMcpClient(context.extensionPath, output);
  const controller = new AtomWorkspaceController(context, mcpClient, output);
  const sidebarProvider = new AtomSidebarViewProvider(controller);

  context.subscriptions.push(
    output,
    { dispose: () => mcpClient.dispose() },
    vscode.window.registerWebviewViewProvider('atom.testWorkspaceView', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  let besidePanel = null;
  let newWindowCounter = 0;

  const createAtomPanel = (viewType, title, onDisposeExtra) => {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      vscode.ViewColumn.Beside,
      {
        ...controller.getWebviewOptions(),
        retainContextWhenHidden: true
      }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'atom-logo.png');
    panel.webview.html = controller.getWebviewHtml(panel.webview);
    controller.registerSurface(panel.webview);
    panel.webview.onDidReceiveMessage(msg => controller.handleMessage(panel.webview, msg));
    panel.onDidDispose(() => {
      controller.unregisterSurface(panel.webview);
      if (onDisposeExtra) onDisposeExtra();
    });
    return panel;
  };

  const openBeside = () => {
    if (besidePanel) {
      besidePanel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    besidePanel = createAtomPanel('atom.testWorkspaceBeside', 'ATOM World', () => {
      besidePanel = null;
    });
  };

  const openNewWindow = () => {
    newWindowCounter += 1;
    const title = newWindowCounter === 1 ? 'ATOM World (New)' : `ATOM World #${newWindowCounter}`;
    createAtomPanel(`atom.testWorkspaceWindow.${newWindowCounter}`, title);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('atom.openRightPanel', async () => {
      try {
        await vscode.commands.executeCommand('atom.testWorkspaceView.focus');
      } catch (_) {
        openBeside();
      }
    }),
    vscode.commands.registerCommand('atom.openBesideEditor', openBeside),
    vscode.commands.registerCommand('atom.openNewWindow', openNewWindow),
    vscode.commands.registerCommand('atom.refreshTests', () => controller.refreshTests()),
    vscode.commands.registerCommand('atom.showGuide', () => {
      controller.broadcast({ type: 'toggleGuide' });
    }),
    vscode.commands.registerCommand('atom.configureMcp', async () => {
      const workspaceRoot = mcpClient.getWorkspaceRoot();
      const launch = resolveAtomMcpLaunch(workspaceRoot, context.extensionPath);
      if (!launch) {
        vscode.window.showErrorMessage('Could not locate Atom MCP binary. Run `npm install -g @atomworld/atom`.');
        return;
      }
      const mcpDir = path.join(workspaceRoot, '.vscode');
      const mcpFile = path.join(mcpDir, 'mcp.json');
      fs.mkdirSync(mcpDir, { recursive: true });
      let existing = {};
      if (fs.existsSync(mcpFile)) {
        try {
          existing = JSON.parse(fs.readFileSync(mcpFile, 'utf8')) || {};
        } catch (_) {
          existing = {};
        }
      }
      const serverArg = launch.scriptPath.startsWith(workspaceRoot)
        ? `./${path.relative(workspaceRoot, launch.scriptPath).replace(/\\/g, '/')}`
        : launch.scriptPath;
      existing.servers = {
        ...(existing.servers || {}),
        Atom: {
          type: 'stdio',
          command: 'node',
          args: [serverArg, '--workspace', '${workspaceFolder}']
        }
      };
      fs.writeFileSync(mcpFile, JSON.stringify(existing, null, 2), 'utf8');
      vscode.window.showInformationMessage('Configured Atom MCP server in .vscode/mcp.json');
    })
  );

  // Keep active editor badge updated for context-aware prompts
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      controller.broadcast({
        type: 'activeFileChanged',
        payload: controller.getActiveEditorContext()
      });
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  AtomMcpClient,
  resolveAtomMcpLaunch
};
