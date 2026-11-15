const TEST_TYPES = [
  { id: 'ui', label: 'UI / browser', description: 'Playwright browser E2E test with locators, assertions, and screenshot evidence' },
  { id: 'api', label: 'API', description: 'Declarative API chain (api-test-plan/v1) or Playwright request assertions' },
  { id: 'visual', label: 'Visual', description: 'Responsive desktop & mobile screenshot baseline regression test' },
  { id: 'mixed', label: 'Mixed', description: 'Combined API setup/verification with Playwright browser UI assertions' },
  { id: 'mobile', label: 'Native mobile', description: 'Managed WebdriverIO Appium test for Android (UiAutomator2) or iOS (XCUITest)' }
];

const BROWSERS = [
  { id: 'chromium', label: 'Chromium' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'webkit', label: 'WebKit' }
];

const MOBILE_PLATFORMS = [
  { id: 'android', label: 'Android · UiAutomator2', defaultDevice: 'Pixel 8' },
  { id: 'ios', label: 'iOS · XCUITest', defaultDevice: 'iPhone 16' }
];

const EXAMPLE_PROMPTS = [
  {
    prompt: 'Verify the multi-step checkout workflow with payment confirmation in Chromium',
    testType: 'ui',
    agent: 'test-architect'
  },
  {
    prompt: 'Chain customer creation API with forward-only order ID assertions',
    testType: 'api',
    agent: 'api-planner'
  },
  {
    prompt: 'Validate native Android checkout screen using Appium managed broker',
    testType: 'mobile',
    agent: 'mobile-agent',
    mobilePlatform: 'android',
    mobileDeviceName: 'Pixel 8'
  },
  {
    prompt: 'Test real-user search journey and verify error handling on 3DS payment challenge',
    testType: 'ui',
    agent: 'test-architect'
  }
];

const ATOM_TASKS = [
  {
    id: 'generate_and_save',
    name: 'Generate & Save Test',
    description: 'Create a test from your prompt and save it under atom/ (or your explicit folder).'
  },
  {
    id: 'generate_and_run',
    name: 'Generate, Save & Execute',
    description: 'Create the test, save it to disk, run policy checks, and execute it immediately.'
  },
  {
    id: 'execute_test',
    name: 'Execute Existing Test',
    description: 'Run a saved test from atom/ or a custom folder and inspect logs, results, and media.'
  },
  {
    id: 'policy_audit',
    name: 'Policy & Security Audit',
    description: 'Evaluate a test specification against ATOM PolicyEngine and safety boundaries.'
  },
  {
    id: 'pulse_gaps',
    name: 'Inspect Pulse Coverage Gaps',
    description: 'Find untested real-user journeys from Atom Pulse and draft regression test prompts.'
  },
  {
    id: 'list_tests',
    name: 'Browse Workspace Tests',
    description: 'List all tests stored in atom/ and custom folders with type, tags, and run history.'
  }
];

const ATOM_AGENTS = [
  {
    id: 'ui-agent',
    name: 'UI Agent',
    badge: 'Playwright',
    description: 'Generates governed Playwright UI/browser tests and saves them under your Test Dir (atom/ by default).',
    defaultTask: 'generate_and_save',
    defaultTestType: 'ui',
    supportedTasks: ['generate_and_save', 'generate_and_run', 'execute_test', 'policy_audit', 'list_tests']
  },
  {
    id: 'mobile-agent',
    name: 'Mobile Agent',
    badge: 'Appium',
    description: 'Generates native Android (UiAutomator2) and iOS (XCUITest) WebdriverIO specs bound to ATOM managed device sessions.',
    defaultTask: 'generate_and_save',
    defaultTestType: 'mobile',
    supportedTasks: ['generate_and_save', 'policy_audit', 'execute_test']
  },
  {
    id: 'api-agent',
    name: 'API Agent',
    badge: 'API Chain',
    description: 'Builds chained API tests with forward-only variable bindings, status assertions, and response checks.',
    defaultTask: 'generate_and_save',
    defaultTestType: 'api',
    supportedTasks: ['generate_and_save', 'generate_and_run', 'policy_audit']
  },
  {
    id: 'visual-agent',
    name: 'Visual Agent',
    badge: 'Regression',
    description: 'Generates visual regression tests across desktop and mobile viewports with baseline screenshot checks.',
    defaultTask: 'generate_and_save',
    defaultTestType: 'visual',
    supportedTasks: ['generate_and_save', 'generate_and_run', 'policy_audit']
  },
  {
    id: 'mixed-agent',
    name: 'Mixed Agent',
    badge: 'UI + API',
    description: 'Combines API state setup/verification with Playwright end-to-end browser UI assertions.',
    defaultTask: 'generate_and_save',
    defaultTestType: 'mixed',
    supportedTasks: ['generate_and_save', 'generate_and_run', 'policy_audit']
  },
  {
    id: 'atom-qa',
    name: 'QA Auditor',
    badge: 'Governance',
    description: 'Reviews specifications against PolicyEngine, inspects Atom Pulse coverage gaps, and audits workspace suites.',
    defaultTask: 'policy_audit',
    defaultTestType: 'ui',
    supportedTasks: ['policy_audit', 'pulse_gaps', 'list_tests', 'generate_and_save', 'generate_and_run']
  }
];

const AGENT_ALIASES = {
  'test-architect': 'ui-agent',
  'execution-runner': 'ui-agent',
  'api-planner': 'api-agent'
};

function getAgentById(agentId) {
  const mappedId = AGENT_ALIASES[agentId] || agentId;
  return ATOM_AGENTS.find(agent => agent.id === mappedId) || ATOM_AGENTS[0];
}

function getTaskById(taskId) {
  return ATOM_TASKS.find(task => task.id === taskId) || ATOM_TASKS[0];
}

function resolveAgentAndTask(agentId, taskId) {
  const agent = getAgentById(agentId);
  const resolvedTaskId = taskId && agent.supportedTasks.includes(taskId)
    ? taskId
    : (taskId && ATOM_TASKS.some(t => t.id === taskId) ? taskId : agent.defaultTask);
  const task = getTaskById(resolvedTaskId);
  return { agent, task };
}

module.exports = {
  TEST_TYPES,
  BROWSERS,
  MOBILE_PLATFORMS,
  EXAMPLE_PROMPTS,
  ATOM_TASKS,
  ATOM_AGENTS,
  getAgentById,
  getTaskById,
  resolveAgentAndTask
};
