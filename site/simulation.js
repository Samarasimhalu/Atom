(() => {
  /* ========================================================================
     1. TOP HOVER MEGA-MENU & MOBILE DRAWER
     ======================================================================== */
  function initMegaMenu() {
    const megaItems = [...document.querySelectorAll('[data-mega-item]')];
    let closeTimer = null;
    let activeKey = null;

    function clearTimer() {
      if (closeTimer) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
    }

    function openMenu(key) {
      clearTimer();
      activeKey = key;
      megaItems.forEach(item => {
        const itemKey = item.getAttribute('data-mega-item');
        const btn = item.querySelector('[data-mega-trigger]');
        const panel = item.querySelector('[data-mega-panel]');
        const isMatch = itemKey === key;
        if (btn) {
          btn.classList.toggle('is-active', isMatch);
          btn.setAttribute('aria-expanded', isMatch ? 'true' : 'false');
        }
        if (panel) {
          panel.classList.toggle('is-open', isMatch);
        }
      });
    }

    function closeAll() {
      clearTimer();
      activeKey = null;
      megaItems.forEach(item => {
        const btn = item.querySelector('[data-mega-trigger]');
        const panel = item.querySelector('[data-mega-panel]');
        if (btn) {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-expanded', 'false');
        }
        if (panel) {
          panel.classList.remove('is-open');
        }
      });
    }

    // Remember the pointer so a delayed close can check where it really is.
    let pointerX = -1;
    let pointerY = -1;
    document.addEventListener('mousemove', event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }, { passive: true });

    function within(rect, pad) {
      return pointerX >= rect.left - pad && pointerX <= rect.right + pad &&
        pointerY >= rect.top - pad && pointerY <= rect.bottom + pad;
    }

    // True while the pointer is on the open menu: its button, its panel, or the gap between them.
    function pointerOnActiveMenu() {
      const item = megaItems.find(el => el.getAttribute('data-mega-item') === activeKey);
      if (!item) return false;
      const itemRect = item.getBoundingClientRect();
      if (within(itemRect, 2)) return true;
      const panel = item.querySelector('[data-mega-panel]');
      if (!panel) return false;
      const panelRect = panel.getBoundingClientRect();
      if (within(panelRect, 4)) return true;
      return pointerX >= itemRect.left && pointerX <= itemRect.right &&
        pointerY >= itemRect.bottom && pointerY <= panelRect.top;
    }

    function scheduleClose() {
      clearTimer();
      closeTimer = window.setTimeout(() => {
        if (pointerOnActiveMenu()) {
          scheduleClose(); // still hovering: a slow move across the gap must not close it
          return;
        }
        closeAll();
      }, 260);
    }

    megaItems.forEach(item => {
      const key = item.getAttribute('data-mega-item');
      const btn = item.querySelector('[data-mega-trigger]');
      const panel = item.querySelector('[data-mega-panel]');

      item.addEventListener('mouseenter', () => openMenu(key));
      item.addEventListener('mouseleave', scheduleClose);

      if (panel) {
        panel.addEventListener('mouseenter', clearTimer);
        panel.addEventListener('mouseleave', scheduleClose);
      }

      if (btn) {
        btn.addEventListener('click', event => {
          event.stopPropagation();
          if (activeKey === key) {
            closeAll();
          } else {
            openMenu(key);
          }
        });
      }
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('[data-mega-item]')) {
        closeAll();
      }
    });

    const mobileBtn = document.getElementById('mobileMenuBtn');
    const mobileClose = document.getElementById('mobileCloseBtn');
    const mobileBackdrop = document.getElementById('mobileBackdrop');
    const mobileDrawer = document.getElementById('mobileDrawer');

    function openMobileDrawer() {
      if (!mobileDrawer) return;
      mobileDrawer.classList.add('is-open');
      if (mobileBackdrop) mobileBackdrop.classList.add('is-open');
      if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMobileDrawer() {
      if (!mobileDrawer) return;
      mobileDrawer.classList.remove('is-open');
      if (mobileBackdrop) mobileBackdrop.classList.remove('is-open');
      if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
    }

    if (mobileBtn) mobileBtn.addEventListener('click', openMobileDrawer);
    if (mobileClose) mobileClose.addEventListener('click', closeMobileDrawer);
    if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeMobileDrawer);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAll();
        closeMobileDrawer();
      }
    });

    document.querySelectorAll('.NewMegaMenu_dropItem, .NewMegaMenu_dropdownFooterLink').forEach(link => {
      link.addEventListener('click', () => {
        const jumpStage = link.getAttribute('data-stage-jump');
        if (jumpStage !== null && window.ATOMWalkthrough) {
          window.ATOMWalkthrough.goToStage(Number(jumpStage));
        }
        closeAll();
        closeMobileDrawer();
      });
    });

    document.querySelectorAll('.NewMobileMenu_accBtn').forEach(accBtn => {
      accBtn.addEventListener('click', () => {
        const parent = accBtn.closest('.NewMobileMenu_accItem');
        if (parent) parent.classList.toggle('is-open');
      });
    });
  }

  /* ========================================================================
     2. ATOM GOVERNED EXECUTION MESH ENGINE FLOW (#heroEngine)
     ======================================================================== */
  const engineCaptions = [
    'Natural-Language Intent — Structured requests for ui, api, visual, mixed, or mobile test specifications.',
    'Stage 1 · Generate — POST /api/generate/test normalizes requests through the allowlisted AI gateway with redaction and token budgets.',
    'Stage 2 · Govern — Policy engine verifies tenant context, RBAC role, single-use approval binding, and Idempotency-Key.',
    'Stage 3 · Execute — Dispatches to an isolated digest-pinned Playwright 1.62.1 or Appium worker container when EXECUTION_ENABLED=true.',
    'Stage 4 · Observe — AtomRunStream emits sequence-numbered transitions and reconciles durable state via GET /api/runs/:id/events?after=N.',
    'Tenant Evidence — Private S3/local artifacts authorized per tenant with short-lived signed download URLs and retention tombstones.'
  ];

  function initHeroEngine() {
    const nodes = [...document.querySelectorAll('#heroEngine [data-ef]')];
    const statusText = document.getElementById('efStatusText');
    let activeIdx = 1;

    function highlightNode(idx) {
      activeIdx = idx;
      nodes.forEach(node => {
        node.classList.toggle('is-active', Number(node.getAttribute('data-ef')) === idx);
      });
      if (statusText && engineCaptions[idx]) {
        statusText.textContent = engineCaptions[idx];
      }
    }

    nodes.forEach(node => {
      node.addEventListener('mouseenter', () => {
        highlightNode(Number(node.getAttribute('data-ef')));
      });
      const jump = node.getAttribute('data-jump');
      if (jump !== null) {
        node.addEventListener('click', () => {
          if (window.ATOMWalkthrough) {
            window.ATOMWalkthrough.goToStage(Number(jump));
          }
          const wt = document.getElementById('walkthrough');
          if (wt) wt.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    });

    window.setInterval(() => {
      let next = (activeIdx + 1) % nodes.length;
      if (next === 0) next = 1;
      highlightNode(next);
    }, 3400);

    const canvas = document.getElementById('heroCanvas');
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      const pts = [];
      function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = Math.max(300, rect.width);
        canvas.height = Math.max(180, rect.height);
      }
      resize();
      window.addEventListener('resize', resize);
      for (let i = 0; i < 24; i += 1) {
        pts.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: 1.2 + Math.random() * 1.5
        });
      }
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pts.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;
          if (p.y < 0) p.y = canvas.height;
          if (p.y > canvas.height) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(125, 211, 252, 0.42)';
          ctx.fill();
        });
        window.requestAnimationFrame(draw);
      }
      window.requestAnimationFrame(draw);
    }
  }

  /* ========================================================================
     3. INTERACTIVE 4-STAGE WALKTHROUGH (#walkthrough — Strictly ATOM Data)
     ======================================================================== */
  const stageMeta = [
    {
      num: 1,
      name: 'Generate',
      title: '1 · Generate — Describe the Test Intent',
      desc: 'ATOM validates and normalizes a natural-language request into a structured specification through an allowlisted AI gateway with input redaction, token budgets, evaluation, and audit events.',
      input: 'POST /api/generate/test (ui | api | visual | mixed | mobile)',
      output: 'Validated Playwright / API / Appium specification',
      caps: [
        'Allowlisted AI gateway (AI_ALLOWED_MODELS, AI_DAILY_TOKEN_BUDGET)',
        'Supports chromium, firefox, webkit, api-test-plan/v1 & mobile (ios/android)',
        'Unsafe code denylist blocks child_process, eval, process.env & FS access'
      ],
      steps: [
        'Authenticate tenant context (X-Tenant-Id / OIDC JWT)',
        'Redact sensitive inputs & check daily AI token budget',
        'Generate & validate structured test specification',
        'Emit generation audit event'
      ],
      gate: 'Generated code is treated as untrusted input and validated against the schema and unsafe-code denylist.',
      approveLabel: 'Proceed to Govern'
    },
    {
      num: 2,
      name: 'Govern',
      title: '2 · Govern — Evaluate Policy and Approval',
      desc: 'Execution decisions bind the specification, intent, idempotency key, session, and policy version to prevent replay or substitution. High-risk or policy-tagged runs require an explicit approval.',
      input: 'Validated specification + Idempotency-Key + X-Tenant-Id',
      output: 'Single-use policy-bound approval & admission token',
      caps: [
        'RBAC role enforcement (viewer, developer, approver, admin, owner)',
        'Policy engine checks POLICY_REQUIRE_APPROVAL_TAGS & POLICY_BLOCKED_DOMAINS',
        'Single-use approval via POST /api/approvals/:id/decision'
      ],
      steps: [
        'Verify RBAC role (developer, approver, admin, or owner)',
        'Evaluate policy rules, timeout bounds & tenant run quotas',
        'Bind approval decision to spec, session & policy version',
        'Verify unique tenant Idempotency-Key'
      ],
      gate: 'Execution returns 409 approval_required or 403 unsafe_execution_denied if prerequisites are absent.',
      approveLabel: 'Approve & Dispatch'
    },
    {
      num: 3,
      name: 'Execute',
      title: '3 · Execute — Dispatch to an Isolated Worker',
      desc: 'The durable run state machine coordinates idempotent, cancellable execution on a prebuilt, non-root Playwright 1.62.1 worker or immutable SHA-256-pinned Appium mobile worker.',
      input: 'POST /api/execute/test with EXECUTION_ENABLED=true',
      output: 'Isolated container run + JUnit / trace / screenshot artifacts',
      caps: [
        'State machine: requested → validated → queued → assigned → running',
        'Digest-pinned Playwright Noble worker (no runtime package install)',
        'Fail-closed Appium worker (read-only FS, cap-drop=ALL, HTTPS device broker)'
      ],
      steps: [
        'Persist run state in PostgreSQL & enqueue job in Redis/BullMQ',
        'Launch isolated non-root worker container',
        'Run Playwright / Appium / Aegis self-healing locator checks',
        'Enforce artifact file/byte quotas & collect results'
      ],
      gate: 'Workers never install customer-controlled packages at runtime and run with no-new-privileges.',
      approveLabel: 'Collect & Observe'
    },
    {
      num: 4,
      name: 'Observe',
      title: '4 · Observe — Reconcile Live Transitions & Evidence',
      desc: 'AtomRunStream provides validated live run events, sequence de-duplication, reconnection, and durable HTTP replay while authorization-aware storage protects tenant artifacts.',
      input: 'collecting_artifacts → passed | failed',
      output: 'Replayable event stream + short-lived signed artifact URLs',
      caps: [
        'Reconnectable event replay via GET /api/runs/:id/events?after=N',
        'Private S3/MinIO artifact authorization via GET /api/artifacts/:id/download',
        'Automated retention_until cleanup & metadata tombstoning'
      ],
      steps: [
        'Stream sequence-numbered events via AtomRunStream',
        'Persist final run verdict, audit trail & quota usage',
        'Authorize tenant before issuing short-lived artifact URL',
        'Enforce ARTIFACT_RETENTION_DAYS lifecycle policy'
      ],
      gate: 'Artifact objects are private and never exposed as unauthenticated filesystem paths.',
      approveLabel: 'Complete Lifecycle'
    }
  ];

  function initWalkthrough() {
    let currentStage = 0;
    let approvedStages = [false, false, false, false];
    let playTimer = null;
    let isPlaying = false;

    const sideEl = document.getElementById('wtSide');
    const bodyEl = document.getElementById('appBody');
    const stepsEl = document.getElementById('appSteps');
    const statusEl = document.getElementById('wtStatus');
    const doneBanner = document.getElementById('wtDone');
    const playBtnText = document.getElementById('btnPlayText');

    function renderSide(idx) {
      const m = stageMeta[idx];
      const isApp = approvedStages[idx];
      if (!sideEl) return;
      sideEl.innerHTML =
        `<div class="side-head">
          <span class="side-badge">Stage ${m.num} of 4</span>
          <span class="side-state ${isApp ? 'approved' : ''}">${isApp ? '✓ Verified' : '● Active Stage'}</span>
        </div>
        <h3 class="side-title">${m.title}</h3>
        <p class="side-desc">${m.desc}</p>
        <div class="side-io">
          <div><strong>Input</strong><span>${m.input}</span></div>
          <div><strong>Output</strong><span>${m.output}</span></div>
        </div>
        <div>
          <h4 class="side-block-title">Enforced Controls</h4>
          <ul class="side-caps">
            ${m.caps.map(c => `<li><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10l4 4 8-8"/></svg><span>${c}</span></li>`).join('')}
          </ul>
        </div>
        <div class="side-progress">
          <div class="side-prog-bar"><span style="width:${isApp ? 100 : 75}%"></span></div>
          <ul class="side-steps">
            ${m.steps.map((s, sIdx) => {
              const cls = isApp || sIdx < 3 ? 'done' : 'now';
              return `<li class="${cls}"><span class="dot">${cls === 'done' ? '✓' : '•'}</span><span>${s}</span></li>`;
            }).join('')}
          </ul>
        </div>
        <div class="side-gate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>${m.gate}</span>
        </div>`;
    }

    function renderPane(idx) {
      if (!bodyEl) return;
      const m = stageMeta[idx];
      const isApp = approvedStages[idx];
      let contentHtml = '';

      if (idx === 0) {
        contentHtml =
          `<div class="pane-bar">
            <span class="wt-pill new">POST /api/generate/test</span>
            <span class="wt-pill reuse">X-Tenant-Id: acme-dev</span>
            <span class="wt-pill pass" style="margin-left:auto;">✓ Schema &amp; Denylist Passed</span>
          </div>
          <div class="wt-grid-2">
            <div class="wt-card">
              <div class="wt-card-head"><span>Supported Test Surfaces</span><span class="wt-pill pass">5 Types</span></div>
              <div class="wt-card-body">
                <div class="wt-row-item is-selected"><div><b>testType: "ui"</b><br/><small>Playwright (chromium, firefox, webkit) · screenshot &amp; trace options</small></div><span class="wt-pill reuse">Web UI</span></div>
                <div class="wt-row-item is-selected"><div><b>testType: "api"</b><br/><small>Declarative api-test-plan/v1 with forward-only {{chain.variable}}</small></div><span class="wt-pill new">API Plan</span></div>
                <div class="wt-row-item is-selected"><div><b>testType: "visual"</b><br/><small>Viewport assertions &amp; retain-on-failure visual evidence</small></div><span class="wt-pill reuse">Visual</span></div>
                <div class="wt-row-item is-selected"><div><b>testType: "mixed"</b><br/><small>Coordinated API setup + Playwright browser verification</small></div><span class="wt-pill new">Mixed</span></div>
                <div class="wt-row-item is-selected"><div><b>testType: "mobile"</b><br/><small>iOS (XCUITest) &amp; Android (UiAutomator2) with ~accessibility-id</small></div><span class="wt-pill pass">Appium</span></div>
              </div>
            </div>
            <div class="wt-card">
              <div class="wt-card-head"><span>Normalized Specification Output</span><span class="wt-pill new">Untrusted Input Guard</span></div>
              <div class="wt-card-body">
                <div class="wt-code-line"><span class="wt-code-num">1</span><span><code>import { test, expect } from '@playwright/test';</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">2</span><span><code>test('homepage returns a title', async ({ page }) =&gt; {</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">3</span><span><code>  await page.goto('https://example.com');</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">4</span><span><code>  await expect(page).toHaveTitle(/Example/);</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">5</span><span><code>});</code></span></div>
                <div class="wt-row-item" style="margin-top:auto;background:var(--p-50);"><div><b>Denylist Verification</b><br/><small>Verified zero occurrences of <code>child_process</code>, <code>eval</code>, <code>process.env</code>, or host FS calls.</small></div></div>
              </div>
            </div>
          </div>`;
      } else if (idx === 1) {
        contentHtml =
          `<div class="pane-bar">
            <span class="wt-pill reuse">AUTH_MODE: oidc | development</span>
            <span class="wt-pill new">POST /api/approvals/:id/decision</span>
            <span class="wt-pill pass" style="margin-left:auto;">✓ Policy &amp; Idempotency Bound</span>
          </div>
          <div class="wt-grid-2">
            <div class="wt-card">
              <div class="wt-card-head"><span>RBAC &amp; Policy Gate Checks</span><span>Tenant: acme-dev</span></div>
              <div class="wt-card-body">
                <div class="wt-row-item is-selected"><div><b>Identity &amp; Role Check</b><br/><small>Roles: viewer, developer, approver, admin, owner</small></div><span class="wt-pill pass">ENFORCED</span></div>
                <div class="wt-row-item is-selected"><div><b>Approval Binding</b><br/><small>Binds spec hash, intent, sessionId, Idempotency-Key &amp; policy version</small></div><span class="wt-pill pass">BOUND</span></div>
                <div class="wt-row-item is-selected"><div><b>Domain &amp; Timeout Policy</b><br/><small>Checked against POLICY_BLOCKED_DOMAINS &amp; POLICY_MAX_TIMEOUT_MS</small></div><span class="wt-pill pass">ALLOWED</span></div>
                <div class="wt-row-item is-selected"><div><b>Tenant Quota Guard</b><br/><small>Checked against MAX_RUNS_PER_TENANT &amp; AI_DAILY_TOKEN_BUDGET</small></div><span class="wt-pill pass">WITHIN QUOTA</span></div>
              </div>
            </div>
            <div class="wt-card">
              <div class="wt-card-head"><span>Approval Decision Payload</span><span class="wt-pill pass">Single-Use</span></div>
              <div class="wt-card-body">
                <div class="wt-code-line"><span class="wt-code-num">H</span><span><code>X-Tenant-Id: acme-dev</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">H</span><span><code>Idempotency-Key: acme-dev-run_1710001</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">H</span><span><code>X-Approval-Id: apr_9042_verified</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">✓</span><span><code>{"decision": "approved", "comment": "Approved for controlled QA execution."}</code></span></div>
                <div class="wt-row-item" style="margin-top:auto;background:var(--p-50);"><div><b>Replay &amp; Substitution Prevention</b><br/><small>Repeated submissions with the same Idempotency-Key return the original run without duplicating jobs.</small></div></div>
              </div>
            </div>
          </div>`;
      } else if (idx === 2) {
        contentHtml =
          `<div class="pane-bar">
            <span class="wt-pill pass">EXECUTION_ENABLED=true</span>
            <span class="wt-pill reuse">WORKER_MODE=isolated-image</span>
            <span class="wt-pill new" style="margin-left:auto;">State: requested → validated → queued → assigned → running</span>
          </div>
          <div class="wt-grid-2">
            <div class="wt-card">
              <div class="wt-card-head"><span>Isolated Worker Runtimes</span><span>Fail-Closed Admission</span></div>
              <div class="wt-card-body">
                <div class="wt-row-item is-selected"><div><b>Playwright Worker (1.62.1)</b><br/><small><code>workers/playwright/Dockerfile</code> · Digest-pinned Noble image · Non-root</small></div><span class="wt-pill pass">ISOLATED</span></div>
                <div class="wt-row-item is-selected"><div><b>Appium Mobile Worker (iOS &amp; Android)</b><br/><small><code>workers/appium/Dockerfile</code> · Read-only FS · <code>cap-drop=ALL</code> · HTTPS Broker</small></div><span class="wt-pill pass">ISOLATED</span></div>
                <div class="wt-row-item is-selected"><div><b>Vendored Aegis QA Self-Healing</b><br/><small><code>tools/aegis-qa</code> · Confidence-gated click/fill repair → <code>aegis-healing.patch.json</code></small></div><span class="wt-pill new">ACTIVE</span></div>
              </div>
            </div>
            <div class="wt-card">
              <div class="wt-card-head"><span>Worker Security Boundary</span><span class="wt-pill pass">@sha256 Pinned</span></div>
              <div class="wt-card-body">
                <div class="wt-code-line"><span class="wt-code-num">1</span><span>No runtime <code>npm install</code> of customer-controlled packages</span></div>
                <div class="wt-code-line"><span class="wt-code-num">2</span><span>Runs non-root with <code>no-new-privileges</code> &amp; CPU/memory/PID limits</span></div>
                <div class="wt-code-line"><span class="wt-code-num">3</span><span>Appium worker writes JUnit to <code>/results/results.xml</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">4</span><span>Enforces configured artifact file count and byte quotas</span></div>
              </div>
            </div>
          </div>`;
      } else {
        contentHtml =
          `<div class="pane-bar">
            <span class="wt-pill pass">State: collecting_artifacts → passed</span>
            <span class="wt-pill reuse">GET /api/runs/:id/events?after=N</span>
            <span class="wt-pill new" style="margin-left:auto;">S3 / Local Private Artifacts</span>
          </div>
          <div class="wt-grid-2">
            <div class="wt-card">
              <div class="wt-card-head"><span>AtomRunStream Sequence Events</span><span>Durable Replay</span></div>
              <div class="wt-card-body">
                <div class="wt-code-line"><span class="wt-code-num">01</span><span><code>seq:1 · state: "requested" → "validated"</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">02</span><span><code>seq:2 · state: "queued" → "assigned" (BullMQ jobId=runId)</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">03</span><span><code>seq:3 · state: "running" → "collecting_artifacts"</code></span></div>
                <div class="wt-code-line"><span class="wt-code-num">04</span><span><code>seq:4 · state: "passed" · dashboard invalidation emitted</code></span></div>
              </div>
            </div>
            <div class="wt-card">
              <div class="wt-card-head"><span>Tenant-Authorized Evidence &amp; Retention</span><span class="wt-pill pass">TRACEABLE</span></div>
              <div class="wt-card-body">
                <div class="wt-row-item is-selected"><div><b>GET /api/artifacts/:id/download</b><br/><small>Verifies tenant ownership before issuing short-lived signed URL</small></div><span class="wt-pill pass">Authorized</span></div>
                <div class="wt-row-item is-selected"><div><b>GET /api/audit &amp; GET /api/dashboard</b><br/><small>Tenant operational metrics, success rate &amp; immutable audit records</small></div><span class="wt-pill reuse">Recorded</span></div>
                <div class="wt-row-item"><div><b>Retention Lifecycle (retention_until)</b><br/><small>Hourly process removes expired objects and tombstones metadata</small></div><span class="wt-pill new">Managed</span></div>
              </div>
            </div>
          </div>`;
      }

      bodyEl.innerHTML =
        `<div class="stage-pane is-active">
          ${contentHtml}
          <div class="pane-foot">
            <div class="pane-foot-info">
              <span><b>${m.title}</b></span>
              <span>·</span>
              <span>${isApp ? '✓ Stage verified' : 'Inspect stage details or advance'}</span>
            </div>
            <button type="button" class="btn btn-approve" id="paneApproveBtn">
              ✓ <span>${isApp ? 'Verified (Next Stage)' : m.approveLabel}</span>
            </button>
          </div>
        </div>`;

      const appBtn = document.getElementById('paneApproveBtn');
      if (appBtn) {
        appBtn.addEventListener('click', approveCurrentStage);
      }
    }

    function updateStepper() {
      document.querySelectorAll('[data-wt-stage]').forEach(btn => {
        const idx = Number(btn.getAttribute('data-wt-stage'));
        btn.classList.toggle('is-active', idx === currentStage);
        btn.classList.toggle('is-done', approvedStages[idx]);
      });

      if (stepsEl) {
        stepsEl.innerHTML = stageMeta.map((_, idx) => {
          const cls = idx === currentStage ? 'active' : approvedStages[idx] ? 'done' : '';
          return `<span class="${cls}"></span>`;
        }).join('');
      }
    }

    function goToStage(idx) {
      const clamped = Math.max(0, Math.min(3, idx));
      currentStage = clamped;
      updateStepper();
      renderSide(currentStage);
      renderPane(currentStage);
      // First stage has nothing before it and the last has nothing after it.
      const prevStageBtn = document.getElementById('btnPrev');
      const nextStageBtn = document.getElementById('btnNext');
      if (prevStageBtn) prevStageBtn.disabled = currentStage === 0;
      if (nextStageBtn) nextStageBtn.disabled = currentStage === 3;
      if (statusEl) {
        statusEl.textContent = `Viewing Stage ${currentStage + 1} (${stageMeta[currentStage].name}).`;
      }
    }

    function approveCurrentStage() {
      approvedStages[currentStage] = true;
      updateStepper();
      renderSide(currentStage);
      renderPane(currentStage);

      if (currentStage < 3) {
        window.setTimeout(() => {
          goToStage(currentStage + 1);
        }, 280);
      } else {
        if (doneBanner) doneBanner.hidden = false;
        if (statusEl) {
          statusEl.textContent = 'All 4 stages of the ATOM governed run lifecycle completed.';
        }
        stopAutoplay();
      }
    }

    function stopAutoplay() {
      isPlaying = false;
      if (playTimer) {
        window.clearInterval(playTimer);
        playTimer = null;
      }
      if (playBtnText) playBtnText.textContent = 'Play walkthrough';
    }

    function toggleAutoplay() {
      if (isPlaying) {
        stopAutoplay();
        return;
      }
      isPlaying = true;
      if (playBtnText) playBtnText.textContent = 'Pause walkthrough';
      if (statusEl) statusEl.textContent = 'Auto-playing ATOM 4-stage governed lifecycle...';
      playTimer = window.setInterval(() => {
        approvedStages[currentStage] = true;
        if (currentStage < 3) {
          goToStage(currentStage + 1);
        } else {
          updateStepper();
          renderSide(currentStage);
          renderPane(currentStage);
          if (doneBanner) doneBanner.hidden = false;
          stopAutoplay();
        }
      }, 2400);
    }

    function restartWalkthrough() {
      stopAutoplay();
      approvedStages = [false, false, false, false];
      if (doneBanner) doneBanner.hidden = true;
      goToStage(0);
    }

    document.querySelectorAll('[data-wt-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        stopAutoplay();
        goToStage(Number(btn.getAttribute('data-wt-stage')));
      });
    });

    const prevBtn = document.getElementById('btnPrev');
    const nextBtn = document.getElementById('btnNext');
    const playBtn = document.getElementById('btnPlay');
    const restartBtn = document.getElementById('btnRestart');
    const replayBtn = document.getElementById('btnReplay');

    if (prevBtn) prevBtn.addEventListener('click', () => { stopAutoplay(); goToStage(currentStage - 1); });
    if (nextBtn) nextBtn.addEventListener('click', () => { stopAutoplay(); goToStage(currentStage + 1); });
    if (playBtn) playBtn.addEventListener('click', toggleAutoplay);
    if (restartBtn) restartBtn.addEventListener('click', restartWalkthrough);
    if (replayBtn) replayBtn.addEventListener('click', restartWalkthrough);

    goToStage(0);

    window.ATOMWalkthrough = {
      goToStage,
      restart: restartWalkthrough
    };
  }

  /* ========================================================================
     4. ORIGINAL ATOM BROWSER-ONLY API CHAIN SIMULATOR ([data-test-runner])
     ======================================================================== */
  function initAtomSimulator() {
    const runner = document.querySelector('[data-test-runner]');
    if (!runner) return;

    const startButton = runner.querySelector('[data-runner-start]');
    const resetButton = runner.querySelector('[data-runner-reset]');
    const exportJsonButton = runner.querySelector('[data-runner-export-json]');
    const exportPdfButton = runner.querySelector('[data-runner-export-pdf]');
    const authSelect = runner.querySelector('[data-runner-auth]');
    const credentialReference = runner.querySelector('[data-runner-credential-ref]');
    const authIndicator = runner.querySelector('[data-runner-auth-indicator]');
    const stateLabel = runner.querySelector('[data-runner-state]');
    const announcement = runner.querySelector('[data-runner-announcement]');
    const log = runner.querySelector('[data-runner-log]');
    const phaseNodes = [...runner.querySelectorAll('[data-runner-phase]')];
    const stepNodes = [...runner.querySelectorAll('[data-runner-step]')];
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let currentEvidence = null;
    let currentRunId = null;
    let startedAt = null;
    let logEvents = [];

    const steps = [
      { id: 'create-order', request: 'POST /v1/orders', result: '201 Created', detail: 'Assertions passed; orderId extracted (internal)' },
      { id: 'get-order', request: 'GET /v1/orders/{{chain.orderId}}', result: '200 OK', detail: 'Chained request resolved; state asserted' },
      { id: 'verify-evidence', request: 'GET /v1/orders/{{chain.orderId}}/receipt', result: '200 OK', detail: 'Header and JSON-path assertions passed' }
    ];

    const authProfiles = {
      oauth2: {
        label: 'OAuth2 simulation',
        reportLabel: 'OAuth 2.0 client credentials',
        event: 'Simulated OAuth 2.0 client-credentials token accepted (credential not retained)'
      },
      'api-key': {
        label: 'API key simulation',
        reportLabel: 'API key header',
        event: 'Simulated API-key header attached (credential not retained)'
      }
    };

    const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, prefersReducedMotion ? 0 : milliseconds));
    const safeRunId = () => `sim-${typeof crypto?.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`;
    const currentAuth = () => authProfiles[authSelect.value] || authProfiles.oauth2;

    function setState(text, tone = 'idle') {
      stateLabel.textContent = text;
      stateLabel.dataset.tone = tone;
      announcement.textContent = text;
    }

    function setPhase(index, state) {
      phaseNodes.forEach((node, nodeIndex) => {
        node.dataset.state = nodeIndex < index ? 'complete' : nodeIndex === index ? state : 'pending';
      });
    }

    function setExportAvailability(enabled) {
      exportJsonButton.disabled = !enabled;
      exportPdfButton.disabled = !enabled;
      // Hide the export buttons until a simulation has finished.
      exportJsonButton.parentElement.hidden = !enabled;
    }

    function refreshAuthIndicator() {
      authIndicator.textContent = currentAuth().label;
    }

    function appendLog(message, kind = 'note') {
      const entry = document.createElement('p');
      entry.className = `runner-log-entry runner-log-${kind}`;
      entry.textContent = message;
      log.append(entry);
      log.scrollTop = log.scrollHeight;
      logEvents.push({ at: new Date().toISOString(), kind, message });
    }

    function stepEvidence() {
      return steps.map((step, index) => ({
        id: step.id,
        request: step.request,
        status: stepNodes[index].dataset.state,
        result: stepNodes[index].querySelector('[data-step-result]').textContent
      }));
    }

    function buildEvidence(status) {
      const auth = currentAuth();
      return {
        schemaVersion: 'atom-simulation-evidence/v1',
        generatedAt: new Date().toISOString(),
        runId: currentRunId,
        scope: 'browser-only synthetic simulation',
        authentication: {
          mode: authSelect.value,
          mechanism: auth.reportLabel,
          credentialReference: credentialReference.value.trim() ? 'configured; not retained' : 'default; not retained',
          credentialValue: 'not collected'
        },
        result: { status, stepCount: steps.length, durationMs: Math.max(0, Date.now() - startedAt) },
        steps: stepEvidence(),
        events: logEvents.map(event => ({ ...event })),
        evidenceBoundary: 'Synthetic simulation only. No network request, token, API-key value, customer data, artifact, or live test result is contained in this report.'
      };
    }

    function reset() {
      currentEvidence = null;
      currentRunId = null;
      startedAt = null;
      logEvents = [];
      log.replaceChildren();
      stepNodes.forEach(node => {
        node.dataset.state = 'queued';
        node.querySelector('[data-step-result]').textContent = 'Awaiting execution';
      });
      setPhase(0, 'active');
      setState('Ready to simulate', 'idle');
      startButton.disabled = false;
      startButton.textContent = 'Run simulation';
      setExportAvailability(false);
      refreshAuthIndicator();
      appendLog('Loaded declarative plan: api-test-plan/v1 · 3 chained steps');
    }

    async function run() {
      reset();
      currentRunId = safeRunId();
      startedAt = Date.now();
      const auth = currentAuth();
      startButton.disabled = true;
      setExportAvailability(false);

      setPhase(0, 'active');
      setState('Validating declarative API plan', 'running');
      appendLog(`Run ${currentRunId}: validating relative paths, methods, and forward-only references`);
      appendLog('Environment allowlist and managed egress gate satisfied', 'success');
      await wait(650);

      setPhase(0, 'complete');
      setPhase(1, 'active');
      setState('Policy and authentication checks complete', 'running');
      appendLog('Tenant context, policy binding, and idempotency key verified', 'success');
      appendLog(auth.event, 'success');
      await wait(650);

      setPhase(1, 'complete');
      setPhase(2, 'active');
      setState('Executing isolated API plan', 'running');

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const stepNode = stepNodes[index];
        stepNode.dataset.state = 'running';
        stepNode.querySelector('[data-step-result]').textContent = 'In progress';
        appendLog(step.request, 'request');
        await wait(800);
        stepNode.dataset.state = 'passed';
        stepNode.querySelector('[data-step-result]').textContent = `${step.result} · passed`;
        appendLog(`${step.id}: ${step.detail}`, 'success');
      }

      setPhase(2, 'complete');
      setPhase(3, 'active');
      setState('Reconciling durable run evidence', 'running');
      appendLog('Safe dashboard invalidation emitted; durable result replay available', 'success');
      await wait(650);
      setPhase(3, 'complete');
      setState('Simulation passed · 3 of 3 steps', 'passed');
      currentEvidence = buildEvidence('passed');
      setExportAvailability(true);
      startButton.disabled = false;
      startButton.textContent = 'Run again';
    }

    function downloadBlob(blob, filename) {
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function evidenceLines(evidence) {
      return [
        'ATOM Synthetic Test Evidence Report',
        `Run: ${evidence.runId}`,
        `Generated: ${evidence.generatedAt}`,
        `Scope: ${evidence.scope}`,
        `Authentication: ${evidence.authentication.mechanism}; credential value not collected`,
        `Result: ${evidence.result.status}; ${evidence.result.stepCount} of ${evidence.result.stepCount} steps passed`,
        ...evidence.steps.map(step => `${step.id}: ${step.result}`),
        'Evidence boundary: no live requests, secrets, customer data, artifacts, or test results are included.'
      ];
    }

    function pdfEscape(value) {
      return String(value).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '');
    }

    function wrapPdfLine(line, width = 88) {
      const words = String(line).split(/\s+/);
      const lines = [];
      let current = '';
      words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > width && current) {
          lines.push(current);
          current = word;
        } else current = candidate;
      });
      if (current) lines.push(current);
      return lines;
    }

    function makePdfBlob(lines) {
      const visibleLines = lines.flatMap(line => wrapPdfLine(line)).slice(0, 48);
      const stream = ['BT', '/F1 11 Tf', '48 748 Td', '15 TL', ...visibleLines.flatMap((line, index) => [`(${pdfEscape(line)}) Tj`, ...(index < visibleLines.length - 1 ? ['T*'] : [])]), 'ET'].join('\n');
      const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`
      ];
      let pdf = '%PDF-1.4\n';
      const offsets = [0];
      objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      });
      const xrefOffset = pdf.length;
      pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
      pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
      return new Blob([pdf], { type: 'application/pdf' });
    }

    function exportJson() {
      if (!currentEvidence) return;
      downloadBlob(new Blob([`${JSON.stringify(currentEvidence, null, 2)}\n`], { type: 'application/json' }), `${currentEvidence.runId}-evidence.json`);
    }

    function exportPdf() {
      if (!currentEvidence) return;
      downloadBlob(makePdfBlob(evidenceLines(currentEvidence)), `${currentEvidence.runId}-evidence.pdf`);
    }

    startButton.addEventListener('click', run);
    resetButton.addEventListener('click', reset);
    authSelect.addEventListener('change', refreshAuthIndicator);
    exportJsonButton.addEventListener('click', exportJson);
    exportPdfButton.addEventListener('click', exportPdf);
    reset();
  }

  if (typeof document !== 'undefined') {
    initMegaMenu();
    initHeroEngine();
    initWalkthrough();
    initAtomSimulator();
  }
})();
