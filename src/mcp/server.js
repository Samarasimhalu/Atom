const readline = require('node:readline');
const path = require('node:path');
const pkg = require('../../package.json');
const { AtomWorkspaceEngine } = require('./workspaceEngine');
const {
  listWorkspaceTests,
  getWorkspaceTest,
  deleteWorkspaceTest
} = require('./workspaceStorage');
const { ATOM_AGENTS, ATOM_TASKS } = require('./agents');

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const AGENT_ENUM = [...new Set([...ATOM_AGENTS.map(a => a.id), 'test-architect', 'execution-runner', 'api-planner'])];

function buildToolsCatalog() {
  return [
    {
      name: 'atom_create_test',
      description: 'Generate a governed UI (Playwright), API, Visual, Mixed, or Native Mobile test from a plain-language prompt and store it under the atom/ folder by default (or an explicit folder if provided or mentioned in the prompt).',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Plain-language test scenario description.' },
          testType: { type: 'string', enum: ['ui', 'api', 'visual', 'mixed', 'mobile'], default: 'ui' },
          folder: { type: 'string', description: 'Target folder relative to workspace root (or path inside workspace). Defaults to "atom".' },
          filename: { type: 'string', description: 'Optional filename (e.g. checkout.spec.ts).' },
          overwrite: { type: 'boolean', default: false },
          agent: { type: 'string', enum: AGENT_ENUM, default: 'ui-agent' },
          browser: { type: 'string', enum: ['chromium', 'firefox', 'webkit'], default: 'chromium' },
          targetUrl: { type: 'string', description: 'Optional target HTTP/HTTPS URL for the test.' },
          mobilePlatform: { type: 'string', enum: ['android', 'ios'], description: 'Required when testType is mobile.' },
          mobileDeviceName: { type: 'string', description: 'Optional managed device name (e.g. Pixel 8, iPhone 16).' },
          llm: {
            type: 'object',
            description: 'Optional user LLM provider/model/key selection (free, openai, anthropic, google). Never saved to disk.',
            properties: {
              provider: { type: 'string', enum: ['free', 'openai', 'anthropic', 'google', 'auto', 'fallback'] },
              model: { type: 'string' },
              apiKey: { type: 'string' }
            }
          },
          timeout: { type: 'integer', minimum: 1000, maximum: 300000 },
          retries: { type: 'integer', minimum: 0, maximum: 5 },
          workspaceRoot: { type: 'string', description: 'Optional workspace root directory override.' }
        },
        required: ['prompt']
      }
    },
    {
      name: 'atom_execute_test',
      description: 'Execute a saved test from atom/ (or a custom folder) via Local Playwright or ATOM Governed Backend, returning logs, summary counts, pass/fail status, duration, and captured media artifacts.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: { type: 'string', description: 'Saved test ID from atom_list_tests or atom_create_test.' },
          filePath: { type: 'string', description: 'Relative or workspace path to the test file (e.g. atom/checkout.spec.ts).' },
          executionMode: { type: 'string', enum: ['auto', 'local-playwright', 'atom-backend'], default: 'auto' },
          approvalId: { type: 'string', description: 'Optional approval ID if ATOM backend policy requires approval.' },
          executionToken: { type: 'string', description: 'Optional execution token for real-time log streaming and cancellation.' },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000 },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_stop_execution',
      description: 'Stop an active running test execution by executionToken or runId.',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
          executionToken: { type: 'string' },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_run_task',
      description: 'Choose an ATOM agent and task to run an end-to-end Test Workspace workflow (generate_and_save, generate_and_run, execute_test, policy_audit, pulse_gaps, or list_tests).',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string', enum: AGENT_ENUM, default: 'ui-agent' },
          task: { type: 'string', enum: ATOM_TASKS.map(t => t.id), default: 'generate_and_save' },
          prompt: { type: 'string' },
          testType: { type: 'string', enum: ['ui', 'api', 'visual', 'mixed', 'mobile'] },
          folder: { type: 'string', description: 'Defaults to "atom" unless specified.' },
          filename: { type: 'string' },
          overwrite: { type: 'boolean', default: false },
          testId: { type: 'string' },
          filePath: { type: 'string' },
          executionMode: { type: 'string', enum: ['auto', 'local-playwright', 'atom-backend'], default: 'auto' },
          executionToken: { type: 'string' },
          options: { type: 'object' },
          llm: { type: 'object' },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_list_tests',
      description: 'List tests stored in the atom/ folder and any explicit workspace test folders.',
      inputSchema: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Optional folder filter.' },
          testType: { type: 'string', enum: ['ui', 'api', 'visual', 'mixed', 'mobile'] },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_read_test',
      description: 'Read a saved test file, its specification, policy state, and last execution results.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
          filePath: { type: 'string' },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_delete_test',
      description: 'Delete a saved test file from the workspace and remove it from the Atom index.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
          filePath: { type: 'string' },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_policy_audit',
      description: 'Audit a saved test against ATOM PolicyEngine, TestSpecification schema, and static security rules.',
      inputSchema: {
        type: 'object',
        properties: {
          testId: { type: 'string' },
          filePath: { type: 'string' },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_pulse_gaps',
      description: 'Inspect Atom Pulse real-user journey coverage gaps and receive suggested test prompts.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          workspaceRoot: { type: 'string' }
        }
      }
    },
    {
      name: 'atom_list_agents',
      description: 'Return ATOM agents, supported tasks, test types, browsers, mobile platforms, example prompts, and workspace status.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceRoot: { type: 'string' }
        }
      }
    }
  ];
}

const PROMPTS_CATALOG = [
  {
    name: 'create-ui-test',
    description: 'Create a Playwright UI test and save it under atom/ (or a specified folder).',
    arguments: [
      { name: 'scenario', description: 'User flow to test', required: true },
      { name: 'folder', description: 'Optional target folder (defaults to atom)', required: false }
    ]
  },
  {
    name: 'create-api-chain',
    description: 'Create an API chain test with forward-only variable bindings.',
    arguments: [
      { name: 'scenario', description: 'API workflow to verify', required: true },
      { name: 'folder', description: 'Optional target folder (defaults to atom)', required: false }
    ]
  },
  {
    name: 'create-mobile-test',
    description: 'Create a managed Android/iOS Appium WebdriverIO test.',
    arguments: [
      { name: 'scenario', description: 'Native mobile flow', required: true },
      { name: 'platform', description: 'android or ios', required: true },
      { name: 'deviceName', description: 'Optional device profile', required: false }
    ]
  },
  {
    name: 'qa-audit-and-run',
    description: 'Audit tests in atom/ against PolicyEngine and execute Playwright checks.',
    arguments: [
      { name: 'filePath', description: 'Relative path to test file', required: false }
    ]
  }
];

function formatToolResult(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError
  };
}

class AtomMcpServer {
  constructor(options = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    this.engine = options.engine || new AtomWorkspaceEngine({
      workspaceRoot: this.workspaceRoot,
      apiBaseUrl: options.apiBaseUrl,
      atomDbDir: options.atomDbDir
    });
    this.notificationSink = typeof options.onNotification === 'function' ? options.onNotification : null;
    this.activeRequestTokens = new Map();
    this.tools = buildToolsCatalog();
  }

  emitNotification(method, params) {
    if (typeof this.notificationSink !== 'function') return;
    try {
      this.notificationSink({ jsonrpc: '2.0', method, params });
    } catch (_) {
      // Never crash tool execution due to notification sink failures
    }
  }

  async callTool(name, args = {}, meta = {}) {
    const workspaceRoot = args.workspaceRoot ? path.resolve(args.workspaceRoot) : this.workspaceRoot;
    const executionToken = args.executionToken || (meta.requestId !== undefined && meta.requestId !== null ? `req-${meta.requestId}` : null);
    if (meta.requestId !== undefined && meta.requestId !== null && executionToken) {
      this.activeRequestTokens.set(String(meta.requestId), executionToken);
    }

    const onLog = entry => {
      this.emitNotification('notifications/atom.executionLog', {
        executionToken,
        testId: args.testId || null,
        ...entry
      });
    };
    const onStateChange = state => {
      this.emitNotification('notifications/atom.executionState', {
        executionToken,
        testId: args.testId || null,
        ...state
      });
    };

    try {
      switch (name) {
        case 'atom_list_agents': {
          return formatToolResult(await this.engine.getCapabilities(workspaceRoot));
        }

        case 'atom_create_test': {
          const options = {
            ...(args.browser ? { browser: args.browser } : {}),
            ...(args.targetUrl ? { targetUrl: args.targetUrl } : {}),
            ...(args.timeout !== undefined ? { timeout: args.timeout } : {}),
            ...(args.retries !== undefined ? { retries: args.retries } : {}),
            ...(args.testType === 'mobile' || args.mobilePlatform
              ? {
                  mobile: {
                    platform: args.mobilePlatform || 'android',
                    ...(args.mobileDeviceName ? { deviceName: args.mobileDeviceName } : {})
                  }
                }
              : {})
          };
          const result = await this.engine.generateTest({
            workspaceRoot,
            prompt: args.prompt,
            testType: args.testType,
            folder: args.folder,
            filename: args.filename,
            overwrite: Boolean(args.overwrite),
            agent: args.agent || 'ui-agent',
            task: 'generate_and_save',
            options,
            llm: args.llm || {},
            save: true
          });
          return formatToolResult(result);
        }

        case 'atom_execute_test': {
          const result = await this.engine.executeTest({
            workspaceRoot,
            testId: args.testId,
            filePath: args.filePath,
            executionMode: args.executionMode || 'auto',
            approvalId: args.approvalId,
            executionToken,
            timeoutMs: args.timeoutMs,
            onLog,
            onStateChange
          });
          return formatToolResult(result, result.status === 'failed' && Boolean(result.error));
        }

        case 'atom_stop_execution': {
          const result = await this.engine.stopExecution({
            runId: args.runId,
            executionToken: args.executionToken
          });
          return formatToolResult(result);
        }

        case 'atom_run_task': {
          const result = await this.engine.runAgentTask({
            workspaceRoot,
            agent: args.agent || 'ui-agent',
            task: args.task,
            prompt: args.prompt,
            testType: args.testType,
            folder: args.folder,
            filename: args.filename,
            overwrite: Boolean(args.overwrite),
            testId: args.testId,
            filePath: args.filePath,
            executionMode: args.executionMode || 'auto',
            executionToken,
            options: args.options || {},
            llm: args.llm || {},
            onLog,
            onStateChange
          });
          return formatToolResult(result);
        }

      case 'atom_list_tests': {
        const tests = await listWorkspaceTests({
          workspaceRoot,
          folder: args.folder,
          testType: args.testType
        });
        return formatToolResult({ workspaceRoot, count: tests.length, tests });
      }

      case 'atom_read_test': {
        const test = await getWorkspaceTest({
          workspaceRoot,
          testId: args.testId,
          filePath: args.filePath
        });
        if (!test) return formatToolResult({ error: 'test_not_found' }, true);
        return formatToolResult(test);
      }

      case 'atom_delete_test': {
        const deleted = await deleteWorkspaceTest({
          workspaceRoot,
          testId: args.testId,
          filePath: args.filePath
        });
        return formatToolResult(deleted);
      }

      case 'atom_policy_audit': {
        const audit = await this.engine.auditPolicy({
          workspaceRoot,
          testId: args.testId,
          filePath: args.filePath
        });
        return formatToolResult(audit);
      }

      case 'atom_pulse_gaps': {
        const pulse = await this.engine.inspectPulseGaps({
          workspaceRoot,
          limit: args.limit || 10
        });
        return formatToolResult(pulse);
      }

        default:
          return formatToolResult({ error: `unknown_tool:${name}` }, true);
      }
    } finally {
      if (meta.requestId !== undefined && meta.requestId !== null) {
        this.activeRequestTokens.delete(String(meta.requestId));
      }
    }
  }

  async listResources() {
    const tests = await listWorkspaceTests({ workspaceRoot: this.workspaceRoot });
    return [
      {
        uri: 'atom://workspace/summary',
        name: 'ATOM Workspace Summary',
        description: 'Registered ATOM agents, tasks, folders, and saved tests inventory',
        mimeType: 'application/json'
      },
      ...tests.map(test => ({
        uri: `atom://tests/${test.id}`,
        name: test.relativePath,
        description: `${test.testType} test — ${test.prompt}`,
        mimeType: 'text/plain'
      }))
    ];
  }

  async readResource(uri) {
    if (uri === 'atom://workspace/summary') {
      const capabilities = await this.engine.getCapabilities(this.workspaceRoot);
      const tests = await listWorkspaceTests({ workspaceRoot: this.workspaceRoot });
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ ...capabilities, tests }, null, 2)
          }
        ]
      };
    }

    if (uri && uri.startsWith('atom://tests/')) {
      const id = uri.slice('atom://tests/'.length);
      const found = await getWorkspaceTest({ workspaceRoot: this.workspaceRoot, testId: id });
      if (!found) throw new Error('resource_not_found');
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: found.code
          }
        ]
      };
    }

    throw new Error('resource_not_found');
  }

  getPrompt(name, args = {}) {
    const promptDef = PROMPTS_CATALOG.find(item => item.name === name);
    if (!promptDef) throw new Error(`prompt_not_found:${name}`);

    const folderText = args.folder ? ` and save it in folder "${args.folder}"` : ' (store under atom/ by default)';
    let instruction;
    if (name === 'create-api-chain') {
      instruction = `Use the Atom MCP tool atom_create_test with testType="api" and agent="api-planner" for scenario: "${args.scenario || ''}"${folderText}.`;
    } else if (name === 'create-mobile-test') {
      instruction = `Use the Atom MCP tool atom_create_test with testType="mobile", agent="mobile-agent", mobilePlatform="${args.platform || 'android'}", mobileDeviceName="${args.deviceName || ''}" for scenario: "${args.scenario || ''}"${folderText}.`;
    } else if (name === 'qa-audit-and-run') {
      instruction = `Use Atom MCP tools atom_list_tests, atom_policy_audit, and atom_execute_test${args.filePath ? ` on "${args.filePath}"` : ''}.`;
    } else {
      instruction = `Use the Atom MCP tool atom_create_test with testType="ui" and agent="test-architect" for scenario: "${args.scenario || ''}"${folderText}.`;
    }

    return {
      description: promptDef.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: instruction
          }
        }
      ]
    };
  }

  async handleMessage(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: message?.id ?? null,
        error: { code: -32600, message: 'Invalid Request' }
      };
    }

    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;

    try {
      switch (method) {
        case 'initialize': {
          const requested = params?.protocolVersion;
          const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : '2024-11-05';
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion,
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false }
              },
              serverInfo: {
                name: 'Atom',
                version: pkg.version
              }
            }
          };
        }

        case 'notifications/initialized':
          return null;

        case 'notifications/cancelled': {
          const token = params?.executionToken || (params?.requestId !== undefined ? this.activeRequestTokens.get(String(params.requestId)) : null);
          await this.engine.stopExecution({
            runId: params?.runId || undefined,
            executionToken: token || undefined
          }).catch(() => {});
          return null;
        }

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: this.tools } };

        case 'tools/call': {
          if (!params?.name) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Tool name is required' } };
          }
          try {
            const result = await this.callTool(params.name, params.arguments || {}, { requestId: id });
            return { jsonrpc: '2.0', id, result };
          } catch (error) {
            return {
              jsonrpc: '2.0',
              id,
              result: formatToolResult({ error: error.message, field: error.field || undefined }, true)
            };
          }
        }

        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: await this.listResources() } };

        case 'resources/read': {
          try {
            const result = await this.readResource(params?.uri);
            return { jsonrpc: '2.0', id, result };
          } catch (error) {
            return { jsonrpc: '2.0', id, error: { code: -32002, message: error.message } };
          }
        }

        case 'prompts/list':
          return { jsonrpc: '2.0', id, result: { prompts: PROMPTS_CATALOG } };

        case 'prompts/get': {
          try {
            return { jsonrpc: '2.0', id, result: this.getPrompt(params?.name, params?.arguments || {}) };
          } catch (error) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: error.message } };
          }
        }

        default:
          if (isNotification) return null;
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
          };
      }
    } catch (error) {
      if (isNotification) return null;
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: error.message || 'Internal error' }
      };
    }
  }

  startStdio() {
    const rawWrite = process.stdout.write.bind(process.stdout);
    // Keep JSON-RPC stdout clean: route any incidental console.log calls to stderr.
    console.log = (...args) => console.error(...args);
    console.info = (...args) => console.error(...args);
    console.debug = (...args) => console.error(...args);

    const rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });

    const writeFrame = obj => {
      rawWrite(`${JSON.stringify(obj)}\n`);
    };
    this.notificationSink = writeFrame;

    rl.on('line', async line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (_) {
        writeFrame({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' }
        });
        return;
      }

      const response = await this.handleMessage(parsed);
      if (response) writeFrame(response);
    });

    rl.on('close', () => {
      process.exit(0);
    });

    process.stderr.write(`[Atom MCP] Listening on stdio (workspace: ${this.workspaceRoot})\n`);
    return rl;
  }
}

module.exports = {
  AtomMcpServer,
  buildToolsCatalog,
  PROMPTS_CATALOG
};
