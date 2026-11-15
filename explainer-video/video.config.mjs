function enhanceCursor() {
  if (window.__atomAdCursor) return;
  window.__atomAdCursor = true;
  const styleCursor = () => {
    const c = document.getElementById('__xv-cursor');
    if (!c) return false;
    c.style.filter = 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.9)) drop-shadow(0 3px 8px rgba(15, 23, 42, 0.65))';
    const p = c.querySelector('path');
    if (p) {
      p.setAttribute('fill', '#ffffff');
      p.setAttribute('stroke', '#312e81');
      p.setAttribute('stroke-width', '2');
    }
    if (!document.getElementById('__atom-halo')) {
      const halo = document.createElement('div');
      halo.id = '__atom-halo';
      Object.assign(halo.style, {
        position: 'fixed',
        left: '-200px',
        top: '-200px',
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: '2147483645',
        border: '2px solid rgba(56, 189, 248, 0.7)',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, rgba(56, 189, 248, 0) 70%)',
        transform: 'translate(-50%, -50%)',
      });
      document.documentElement.appendChild(halo);
      addEventListener('mousemove', (e) => {
        halo.style.left = `${e.clientX}px`;
        halo.style.top = `${e.clientY}px`;
      }, true);
    }
    return true;
  };
  if (!styleCursor()) {
    const obs = new MutationObserver(() => {
      if (styleCursor()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
}

export default {
  name: 'atom-explainer',
  voice: 'en-US-EmmaMultilingualNeural',
  speed: 1.09,
  maxSeconds: 360,
  headerHeight: 86,
  music: 'explainer-video/assets/ad-groove.wav',
  musicVolume: 1.15,

  pronunciations: [
    [/\bATOM\b/g, 'Atom'],
    [/@atomworld\/atom/g, 'at atom world slash atom'],
    [/install -g/g, 'install dash g'],
    [/\bUI\b/g, 'U I'],
    [/\bAPIs\b/g, 'A-P-Is'],
    [/\bAPI\b/g, 'A-P-I'],
    [/\bCLI\b/g, 'C L I'],
    [/\bRBAC\b/g, 'role-based access control'],
    [/\bXCUITest\b/g, 'X C U I Test'],
    [/\bUiAutomator2\b/g, 'U I Automator 2'],
    [/\bWebdriverIO\b/g, 'Webdriver I O'],
    [/\bnpx\b/g, 'N P X'],
    [/\bnpm\b/g, 'N P M'],
    [/\bJSON\b/g, 'Jason'],
    [/\bPDF\b/g, 'P D F'],
    [/\bAegis QA\b/g, 'Aegis Q A'],
    [/\biOS\b/g, 'I O S'],
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
    // ACT 1: INTRODUCE ATOM
    {
      id: 'intro-hook',
      text: "Hey friends! Ever hit deploy, and suddenly tests break right before launch? Say hello to ATOM!",
      steps: [
        { goto: 'site:/', weight: 0.08 },
        { waitFor: '#welcome-title', weight: 0.04 },
        { eval: enhanceCursor, weight: 0.03 },
        { point: '#welcome-title', weight: 1.8 },
        { point: '.welcome__brand', weight: 1.0 },
      ],
    },
    {
      id: 'intro-value',
      text: "Think of ATOM as your testing control plane. It turns plain English into web, API, visual, and mobile tests, all backed by human approvals and audit-ready proof!",
      steps: [
        { point: '.welcome__lead', weight: 1.6 },
        { point: '.welcome__stats li:nth-child(2)', weight: 1.0 },
        { point: '.welcome__stats li:nth-child(3)', weight: 1.0 },
        { point: '.welcome__stats li:nth-child(4)', weight: 1.0 },
      ],
    },
    {
      id: 'overview-planes',
      text: "You get one sleek command center: isolated Playwright workers for web, visual, and API workflows, plus dedicated Appium automation for native iOS and Android!",
      steps: [
        { goto: 'site:/#overview', weight: 0.08 },
        { waitFor: '.nbs_headline', weight: 0.04 },
        { point: '.nbs_headline', weight: 0.9 },
        { point: '.nbs_product_card:first-child h2', weight: 1.5 },
        { point: '.nbs_product_card:last-child h2', weight: 1.5 },
      ],
    },
    {
      id: 'overview-lifecycle',
      text: "And check out this live pipeline right below: every single run moves smoothly from Generate and Govern straight through Execute and Observe!",
      steps: [
        { point: '[data-ef="1"]', weight: 1.1 },
        { point: '[data-ef="2"]', weight: 1.0 },
        { point: '[data-ef="3"]', weight: 1.0 },
        { point: '[data-ef="4"]', weight: 1.1 },
      ],
    },

    // ACT 2: FEATURES SHOWCASE (HUB + EVERY FEATURE)
    {
      id: 'features-hub',
      text: "Ready for the full tour? Welcome to ATOM's feature hub, where every testing superpower is neatly organized and ready for your team!",
      steps: [
        { goto: 'site:/#features', weight: 0.08 },
        { waitFor: '#hub-title', weight: 0.04 },
        { point: '#hub-title', weight: 1.2 },
        { point: '[data-feature="walkthrough"] h2', weight: 1.0 },
        { point: '[data-feature="capabilities"] h2', weight: 1.0 },
        { point: '[data-feature="pulse"] h2', weight: 1.0 },
      ],
    },
    {
      id: 'feat-walkthrough',
      text: "First up, the governed run walkthrough! Watch how each request generates a validated spec, binds a policy approval, executes in isolation, and streams replayable events!",
      steps: [
        { goto: 'site:/#features', weight: 0.04 },
        { click: '[data-feature="walkthrough"]', weight: 0.7 },
        { waitFor: '#wt-title', weight: 0.1 },
        { click: '[data-wt-stage="0"]', weight: 1.1 },
        { click: '[data-wt-stage="1"]', weight: 1.2 },
        { click: '[data-wt-stage="2"]', weight: 1.2 },
        { click: '[data-wt-stage="3"]', weight: 1.2 },
      ],
    },
    {
      id: 'feat-surfaces-web',
      text: "Next, dive into Test Surfaces! Natural-language AI test generation builds Playwright checks across Chromium, Firefox, and WebKit with automatic failure screenshots!",
      steps: [
        { goto: 'site:/#capabilities', weight: 0.08 },
        { waitFor: '#caps-title', weight: 0.04 },
        { point: '#caps-title', weight: 0.9 },
        { point: '.cap-grid .cap:nth-child(1) h3', weight: 1.5 },
        { point: '.cap-grid .cap:nth-child(2) h3', weight: 1.6 },
      ],
    },
    {
      id: 'feat-surfaces-selfheal',
      text: "Want automated API chaining or mixed journeys? Easy! Even better, our Aegis QA engine self-heals broken button locators automatically with confidence gating!",
      steps: [
        { point: '.cap-grid .cap:nth-child(3) h3', weight: 1.2 },
        { point: '.cap-grid .cap:nth-child(4) h3', weight: 1.2 },
        { point: '.cap-grid .cap:nth-child(6) h3', weight: 1.8 },
      ],
    },
    {
      id: 'feat-pulse',
      text: "Quick question: how do you catch real customer journeys nobody tested yet? Meet Atom Pulse! It spots risky coverage gaps and lets our Hey Atom voice copilot write tests on command!",
      steps: [
        { goto: 'site:/#pulse', weight: 0.08 },
        { waitFor: '#pulse h2', weight: 0.04 },
        { point: '#pulse h2', weight: 1.2 },
        { point: '#pulse .atom-table tbody tr:nth-child(2) code', weight: 1.4 },
        { text: 'Hey Atom', in: '#pulse .code-panel-dark', weight: 1.7 },
      ],
    },
    {
      id: 'feat-api-plan',
      text: "For backend services, ATOM replaces brittle scripts with declarative API plans—validating, authorizing, chaining response variables safely forward, and reconciling results!",
      steps: [
        { goto: 'site:/#api-workflow', weight: 0.08 },
        { waitFor: '#api-title', weight: 0.04 },
        { point: '#api-title', weight: 0.9 },
        { point: '.api-rail', weight: 1.3 },
        { text: 'chain.orderId', in: '#api-workflow .code-panel-dark', weight: 1.4 },
      ],
    },
    {
      id: 'feat-mobile',
      text: "Building native mobile apps too? ATOM generates WebdriverIO TypeScript for both iOS XCUITest and Android UiAutomator2, running cleanly inside managed Appium workers!",
      steps: [
        { goto: 'site:/#mobile-automation', weight: 0.08 },
        { waitFor: '#mob-title', weight: 0.04 },
        { point: '.mobile-platforms article:first-child strong', weight: 1.3 },
        { point: '.mobile-platforms article:last-child strong', weight: 1.3 },
        { point: '#mobile-automation .code-panel-dark', weight: 1.2 },
      ],
    },
    {
      id: 'feat-simulator',
      text: "Watch our live API simulator roll! Hit Run simulation, watch all three chained order checks turn green in real time, and unlock instant JSON and PDF evidence!",
      steps: [
        { goto: 'site:/#simulator', weight: 0.08 },
        { waitFor: '[data-runner-start]', weight: 0.04 },
        { click: '[data-runner-start]', weight: 0.9 },
        { point: '.runner-phases', weight: 1.5 },
        { point: '.runner-steps article:nth-child(3)', weight: 1.5 },
        { point: '[data-runner-export-json]', weight: 1.4 },
      ],
    },
    {
      id: 'feat-governance',
      text: "Best of all, enterprise security guards every click—with role-based access control, policy approvals, isolated execution, and full evidence retention!",
      steps: [
        { goto: 'site:/#controls', weight: 0.08 },
        { waitFor: '#ctrl-title', weight: 0.04 },
        { point: '.controls-board .control-row:nth-child(1) h3', weight: 1.1 },
        { point: '.controls-board .control-row:nth-child(2) h3', weight: 1.1 },
        { point: '.controls-board .control-row:nth-child(3) h3', weight: 1.1 },
        { point: '.controls-board .control-row:nth-child(4) h3', weight: 1.1 },
      ],
    },

    // ACT 3: LIVE AI TEST EXECUTION WORKSPACE
    {
      id: 'demo-generate',
      text: "Now here's the fun part! Jump into the live Test Workspace, pick your surface, type a checkout scenario in plain English, and click Generate Test!",
      steps: [
        { goto: 'app:/', weight: 0.08 },
        { waitFor: '#test-prompt', weight: 0.04 },
        { eval: enhanceCursor, weight: 0.03 },
        { point: '#test-type', weight: 0.8 },
        {
          type: '#test-prompt',
          value: 'Verify login and complete checkout flow.',
          delay: 10,
          weight: 1.6,
        },
        { click: 'button.primary-action', weight: 1.3 },
      ],
    },
    {
      id: 'demo-execute',
      text: "Boom! Clean Playwright code appears right beside you! Click Execute Test and watch the full run go green from start to finish!",
      steps: [
        { waitFor: '[role="tabpanel"] pre', weight: 0.08 },
        { point: '[role="tabpanel"] pre', weight: 1.4 },
        { click: 'button.execute-action', weight: 1.3 },
        { waitFor: '[role="tabpanel"][data-state="active"] h4', weight: 0.4 },
      ],
    },
    {
      id: 'demo-logs',
      text: "Inside the Logs tab, you can follow every policy validation check, browser launch, and live execution step as it runs!",
      steps: [
        { click: '[role="tablist"] button:nth-child(2)', weight: 0.45 },
        { waitFor: '[role="tabpanel"][data-state="active"] pre', weight: 0.05 },
        { point: '[role="tabpanel"][data-state="active"] pre', weight: 1.8 },
      ],
    },
    {
      id: 'demo-results',
      text: "Then switch right to Results to celebrate that crisp green Passed status, duration, and test summary!",
      steps: [
        { click: '[role="tablist"] button:nth-child(3)', weight: 0.45 },
        { point: '[role="tabpanel"][data-state="active"] p.capitalize', weight: 1.3 },
        { point: '[role="tabpanel"][data-state="active"] h4', weight: 1.2 },
      ],
    },
    {
      id: 'demo-mobile-toggle',
      text: "Testing mobile instead? One click switches Test type to Native mobile, with iOS XCUITest and Android UiAutomator2 built right in!",
      steps: [
        { click: '[role="tablist"] button:nth-child(1)', weight: 0.5 },
        { select: '#test-type', value: 'mobile', weight: 1.1 },
        { select: 'select[aria-label="Native platform"]', value: 'ios', weight: 1.1 },
        { click: 'button.primary-action', weight: 0.8 },
      ],
    },

    // ACT 4: NPM PACKAGE & TELEMETRY DASHBOARD
    {
      id: 'dashboard-npm-package',
      text: "Now let's open the live Dashboard to see our @atomworld/atom npm package! Up top, its dedicated Package Registry Telemetry card tracks live monthly, weekly, and daily downloads right alongside the latest release on npm!",
      steps: [
        { goto: 'app:/#dashboard', weight: 0.08 },
        { waitFor: '.dashboard-registry-title h2', weight: 0.04 },
        { eval: enhanceCursor, weight: 0.03 },
        { point: '.dashboard-registry-title h2', weight: 1.4 },
        { point: '.dashboard-registry-stats > div:nth-child(1) strong', weight: 1.2 },
        { point: '.dashboard-registry-stats > div:nth-child(2) strong', weight: 1.0 },
        { point: '.dashboard-registry-stats > div:nth-child(4) strong', weight: 1.2 },
        { point: '.dashboard-registry-link', weight: 1.0 },
      ],
    },
    {
      id: 'dashboard-kpis',
      text: "Directly underneath sits your Governed Run Mesh: tracking every single test created, execution run, passed suite, and failed check in real time!",
      steps: [
        { point: '.dashboard-metrics .dashboard-metric:nth-child(1) strong', weight: 1.1 },
        { point: '.dashboard-metrics .dashboard-metric:nth-child(2) strong', weight: 1.1 },
        { point: '.dashboard-metrics .dashboard-metric:nth-child(3) strong', weight: 1.1 },
        { point: '.dashboard-metrics .dashboard-metric:nth-child(4) strong', weight: 1.1 },
      ],
    },
    {
      id: 'dashboard-surfaces-runs',
      text: "And right below, check your full breakdown across UI, API, visual, mixed, and mobile tests, plus clickable recent runs for instant inspection!",
      steps: [
        { point: '#tests-by-surface-title', weight: 1.4 },
        { click: '.dashboard-run:first-child', weight: 1.5 },
      ],
    },

    // ACT 5: INSTALLATION & AD FINALE
    {
      id: 'install-npm',
      text: "Ready to get started? Installing ATOM takes literally seconds! Run npx @atomworld/atom to launch instantly, install globally with npm install -g @atomworld/atom, or clone the repo anytime!",
      steps: [
        { goto: 'site:/#start', weight: 0.08 },
        { waitFor: '#start-title', weight: 0.04 },
        { eval: enhanceCursor, weight: 0.03 },
        { text: 'npx @atomworld/atom', in: '#start .code-panel-dark', weight: 1.7 },
        { text: 'npm install -g @atomworld/atom', in: '#start .code-panel-dark', weight: 1.6 },
        { text: 'git clone', in: '#start .code-panel-dark', weight: 1.2 },
      ],
    },
    {
      id: 'outro',
      text: "AI speed, enterprise governance, and live package telemetry—all in one clean package. Grab @atomworld/atom on npm today, and happy testing!",
      steps: [
        { goto: 'site:/', weight: 0.08 },
        { waitFor: '#welcome-title', weight: 0.04 },
        { eval: enhanceCursor, weight: 0.03 },
        { point: '#welcome-title', weight: 1.3 },
        { point: '[data-launch-app]', weight: 1.5 },
      ],
    },
  ],
};
