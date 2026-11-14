export default {
  name: 'atom-explainer',
  voice: 'af_heart',
  speed: 1.0,
  maxSeconds: 420,
  headerHeight: 90,

  pronunciations: [
    [/\bATOM\b/g, 'Atom'],
    [/@atomworld\/atom/g, 'at atom world slash atom'],
    [/\bRBAC\b/g, 'role based access control'],
    [/\bUI\b/g, 'U I'],
    [/\bAPI\b/g, 'A P I'],
    [/\bCLI\b/g, 'C L I'],
    [/\bCI\/CD\b/g, 'C I C D'],
    [/\bv1\.0\.4\b/g, 'version 1 point 0 point 4'],
  ],

  targets: {
    site: {
      static: 'site',
    },
    app: {
      url: 'http://localhost:3001',
      start: 'node bin/atom.js',
      env: {
        NODE_ENV: 'development',
        AUTH_MODE: 'development',
        ATOM_SERVE_UI: 'true',
        ALLOWED_ORIGINS: 'http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173',
        PORT: '3001',
      },
    },
  },

  scenes: [
    // 1. INTRO — Explain ATOM on the Welcome & Product Overview screens
    {
      id: 'intro',
      text:
        "Hey everyone, how's it going! Welcome to ATOM, the Automated Testing and Orchestration Mesh. " +
        "If your engineering team wants the speed of AI test generation without giving up security, governance, or human control, you are in the right place. " +
        "ATOM turns plain-English prompts into UI, API, visual, mixed, and native mobile tests, and runs every single test inside isolated workers behind policy checks, approvals, and replayable audit evidence.",
      steps: [
        { goto: 'site:/' },
        { waitFor: '#welcome-title' },
        { point: '.welcome__brand', weight: 1 },
        { point: '#welcome-title', weight: 1.4 },
        { point: '.welcome__lead', weight: 1.5 },
        { point: '.welcome__stats', weight: 1.4 },
        { click: '[data-go="features"]', weight: 1.2 },
        { goto: 'site:/#overview' },
        { waitFor: '.nbs_headline' },
        { point: '.nbs_headline', weight: 1.3 },
        { point: '.nbs_product_card:first-child', weight: 1.5 },
        { point: '.nbs_product_card:last-child', weight: 1.5 },
      ],
    },

    // 2. FEATURES — Feature Hub & Core Test Surfaces + Self-Healing
    {
      id: 'features-surfaces',
      text:
        "Let's explore ATOM's feature hub and break down each capability one by one. " +
        "First up is Test Surfaces. Instead of stitching together separate tools for browser, backend, and mobile QA, ATOM unifies five test surfaces under one governed mesh. " +
        "You get isolated Playwright browser testing across Chromium, Firefox, and WebKit, visual regression baselines, mixed UI-and-API journeys, native mobile automation, " +
        "and our vendored Aegis QA engine, which provides confidence-gated locator self-healing whenever a button or input changes in your UI.",
      steps: [
        { goto: 'site:/#features' },
        { waitFor: '#hub-title' },
        { point: '#hub-title', weight: 1 },
        { point: '[data-feature="capabilities"]', weight: 1.2 },
        { goto: 'site:/#capabilities' },
        { waitFor: '#caps-title' },
        { point: '#caps-title', weight: 1.2 },
        { point: '.cap-grid .cap:nth-child(1)', weight: 1.4 },
        { point: '.cap-grid .cap:nth-child(3)', weight: 1.4 },
        { point: '.cap-grid .cap:nth-child(4)', weight: 1.4 },
        { point: '.cap-grid .cap:nth-child(5)', weight: 1.4 },
        { point: '.cap-grid .cap:nth-child(6)', weight: 1.6 },
      ],
    },

    // 3. FEATURES — Atom Pulse, API Chaining & Native Mobile
    {
      id: 'features-pulse-api-mobile',
      text:
        "Next, let's look at Atom Pulse, API Test Chaining, and Native Mobile Automation. " +
        "Atom Pulse tracks real-user journeys with automatic privacy redaction, highlights the exact production flows your tests are missing, and lets you ask the Hey Atom voice copilot to close those coverage gaps. " +
        "For backend services, ATOM's declarative API test plans let you chain multi-step requests safely using forward-only variables without arbitrary script execution. " +
        "And for mobile teams, ATOM generates WebdriverIO TypeScript for iOS XCUITest and Android UiAutomator2, running them inside immutable Appium workers.",
      steps: [
        { goto: 'site:/#pulse' },
        { waitFor: '#pulse' },
        { point: '#pulse h2', weight: 1.2 },
        { point: '#pulse .atom-table', weight: 1.5 },
        { point: '#pulse .code-panel-dark', weight: 1.6 },
        { goto: 'site:/#api-workflow' },
        { waitFor: '#api-title' },
        { point: '#api-title', weight: 1.1 },
        { point: '.api-rail', weight: 1.3 },
        { point: '#api-workflow .code-panel-dark', weight: 1.5 },
        { goto: 'site:/#mobile-automation' },
        { waitFor: '#mob-title' },
        { point: '#mob-title', weight: 1.1 },
        { point: '.mobile-platforms', weight: 1.4 },
        { point: '#mobile-automation .code-panel-dark', weight: 1.4 },
      ],
    },

    // 4. SIMULATOR — Live 4-stage Governed API Run Simulation
    {
      id: 'simulator',
      text:
        "Before we jump into the live workspace, watch how a governed run flows through the interactive API simulator. " +
        "When we click Run Simulation, ATOM steps through four strict stages: Validate, Govern, Execute, and Reconcile. " +
        "First it creates an order and extracts the order ID, then it chains that ID into the retrieve and receipt verification steps, and finally it unlocks JSON and PDF audit evidence exports.",
      steps: [
        { goto: 'site:/#simulator' },
        { waitFor: '#sim-title' },
        { point: '#sim-title', weight: 1 },
        { point: '.runner-auth-config', weight: 1 },
        { click: '[data-runner-start]', weight: 1 },
        { point: '.runner-phases', weight: 1.8 },
        { point: '.runner-steps', weight: 2.2 },
        { point: '.runner-console', weight: 1.8 },
      ],
    },

    // 5. LIVE AI TEST EXECUTION — Hands-on in the ATOM Workspace
    {
      id: 'workspace',
      text:
        "Now let's head into the live ATOM Test Workspace and run an AI test from scratch! " +
        "On the left, we select our test surface—UI Browser, API, Visual, Mixed, or Native Mobile—and describe what we want to test in plain English. " +
        "Let's type a prompt to verify the enterprise login and checkout flow, and click Generate Test. " +
        "Right away, ATOM generates clean, governed Playwright test code on the right. " +
        "Now let's click Execute Test! We can switch to the Logs tab to inspect the step-by-step execution stream, and open the Results tab to verify pass status, duration, and artifacts. " +
        "And if we switch the test type to Native Mobile, ATOM exposes dedicated iOS XCUITest and Android UiAutomator2 device controls right in the same form.",
      steps: [
        { goto: 'app:/' },
        { waitFor: '#test-prompt' },
        { point: '#test-type', weight: 1 },
        {
          type: '#test-prompt',
          value: 'Verify the enterprise login page loads, signs in a test user, and reaches the checkout confirmation screen.',
          delay: 12,
          weight: 2,
        },
        { click: 'button.primary-action', weight: 2 },
        { point: 'pre', weight: 1.8 },
        { click: 'button.execute-action', weight: 2 },
        { click: '[role="tablist"] button:nth-child(2)', weight: 1.8 },
        { click: '[role="tablist"] button:nth-child(3)', weight: 1.8 },
        { click: '[role="tablist"] button:nth-child(1)', weight: 1 },
        { select: '#test-type', value: 'mobile', weight: 1.2 },
        { select: 'select[aria-label="Native platform"]', value: 'ios', weight: 1.5 },
      ],
    },

    // 6. NPM PACKAGE & TELEMETRY DASHBOARD
    {
      id: 'dashboard',
      text:
        "Next, let's open the live Dashboard to see the @atomworld/atom npm package telemetry and operational run metrics. " +
        "Right at the top, in its own dedicated card above the run mesh, is Package Registry Telemetry for @atomworld/atom. " +
        "It tracks live package downloads across the last thirty days, seven days, and twenty-four hours, alongside the latest published release v1.0.4 and a direct link to npm. " +
        "Directly below that is the Governed Run Mesh overview, showing total tests created across all surfaces, total executions, pass rate, failed runs, and a full breakdown of tests created by surface—from UI and API chains to visual, mixed, and native mobile.",
      steps: [
        { goto: 'app:/#dashboard' },
        { waitFor: '#dashboard-title' },
        { scroll: 'top' },
        { point: '.dashboard-registry--standalone', weight: 1.4 },
        { point: '.dashboard-registry-title', weight: 1.3 },
        { point: '.dashboard-registry-stats', weight: 2.0 },
        { point: '.dashboard-registry-link', weight: 1.1 },
        { point: '#dashboard-title', weight: 1.2 },
        { point: '.dashboard-metrics', weight: 2.0 },
        { point: '#tests-by-surface-title', weight: 1.6 },
        { point: '#recent-runs-title', weight: 1.5 },
      ],
    },

    // 7. INSTALLATION & OUTRO
    {
      id: 'install-and-outro',
      text:
        "Finally, let's see how easy it is to install and run ATOM on your own machine. " +
        "Because ATOM is published to the public npm registry and GitHub Packages as @atomworld/atom, you can install it globally with npm install dash g @atomworld/atom, or launch it immediately in any project using npx @atomworld/atom. " +
        "Every install and CLI launch automatically updates your registry telemetry, and you can also clone the repository and run npm ci and npm run dev to start the safe development profile locally. " +
        "Thanks so much for watching! Install @atomworld/atom today, and bring governed AI testing to your workflow.",
      steps: [
        { goto: 'site:/#start' },
        { waitFor: '#start-title' },
        { point: '#start-title', weight: 1.2 },
        { point: '#start .code-panel-dark', weight: 2.2 },
        { point: '#start .atom-table', weight: 2.0 },
        { goto: 'site:/' },
        { waitFor: '#welcome-title' },
        { point: '#welcomeCmdText', weight: 1.5 },
        { point: '#welcome-title', weight: 1.4 },
        { point: '[data-launch-app]', weight: 1.2 },
      ],
    },
  ],
};
