(function () {
  const vscode = acquireVsCodeApi();

  const FALLBACK_AGENTS = [
    {
      id: 'ui-agent',
      name: 'UI Agent',
      badge: 'Playwright',
      description: 'Generates Playwright UI/browser tests and saves them under Test Dir.',
      defaultTestType: 'ui'
    },
    {
      id: 'mobile-agent',
      name: 'Mobile Agent',
      badge: 'Appium',
      description: 'Generates native Android (UiAutomator2) and iOS (XCUITest) specs.',
      defaultTestType: 'mobile'
    },
    {
      id: 'api-agent',
      name: 'API Agent',
      badge: 'API Chain',
      description: 'Builds declarative chained API tests with status and schema assertions.',
      defaultTestType: 'api'
    },
    {
      id: 'visual-agent',
      name: 'Visual Agent',
      badge: 'Regression',
      description: 'Generates desktop and mobile responsive visual regression checks.',
      defaultTestType: 'visual'
    },
    {
      id: 'mixed-agent',
      name: 'Mixed Agent',
      badge: 'UI + API',
      description: 'Combines API setup with Playwright UI verification.',
      defaultTestType: 'mixed'
    },
    {
      id: 'atom-qa',
      name: 'QA Auditor',
      badge: 'Governance',
      description: 'Generates governed tests validated against ATOM PolicyEngine.',
      defaultTestType: 'ui'
    }
  ];

  const FALLBACK_PROVIDERS = [
    {
      id: 'openai',
      name: 'OpenAI',
      defaultModel: 'gpt-4o-mini',
      models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4', 'gpt-3.5-turbo']
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      defaultModel: 'claude-sonnet-4-20250514',
      models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']
    },
    {
      id: 'google',
      name: 'Google (Gemini)',
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
    }
  ];

  const state = {
    agents: FALLBACK_AGENTS,
    providers: FALLBACK_PROVIDERS,
    selectedAgent: 'ui-agent',
    mobilePlatform: 'android',
    mobileDeviceName: '',
    folder: 'atom',
    includeActiveFile: false,
    activeFile: null,
    llmState: {
      provider: 'free',
      model: '',
      hasKey: false,
      maskedKey: '',
      configuredProviders: {},
      maskedKeys: {}
    },
    openPopover: null,
    pendingCardEl: null,
    activeExecuteBtn: null,
    activeExecutions: new Map(),
    lastExecutionContext: null,
    executionsByBtn: new WeakMap()
  };

  const els = {
    btnNewWindow: document.getElementById('btn-new-window'),
    banner: document.getElementById('connection-banner'),
    bannerText: document.getElementById('connection-banner-text'),
    canvas: document.getElementById('atom-canvas'),
    thread: document.getElementById('thread'),
    prompt: document.getElementById('input-prompt'),
    btnSend: document.getElementById('btn-send'),
    btnAttach: document.getElementById('btn-attach'),
    activeFileRow: document.getElementById('active-file-chip-row'),
    activeFileChip: document.getElementById('active-file-chip'),
    btnRemoveActiveFile: document.getElementById('btn-remove-active-file'),
    btnAgent: document.getElementById('btn-agent'),
    labelAgent: document.getElementById('label-agent'),
    btnModelKey: document.getElementById('btn-model-key'),
    labelModelKey: document.getElementById('label-model-key'),
    btnTestDir: document.getElementById('btn-test-dir'),
    labelTestDir: document.getElementById('label-test-dir'),
    popoverAgent: document.getElementById('popover-agent'),
    agentList: document.getElementById('agent-list'),
    mobileOptions: document.getElementById('mobile-options'),
    selectMobilePlatform: document.getElementById('select-mobile-platform'),
    inputMobileDevice: document.getElementById('input-mobile-device'),
    btnMobileNext: document.getElementById('btn-mobile-next'),
    popoverModelKey: document.getElementById('popover-model-key'),
    modelKeyTitle: document.getElementById('model-key-title'),
    inputApiKey: document.getElementById('input-api-key'),
    btnToggleKeyVis: document.getElementById('btn-toggle-key-vis'),
    savedKeyStatus: document.getElementById('saved-key-status'),
    selectLlmProvider: document.getElementById('select-llm-provider'),
    selectLlmModel: document.getElementById('select-llm-model'),
    btnSaveLlm: document.getElementById('btn-save-llm'),
    btnClearLlm: document.getElementById('btn-clear-llm'),
    popoverTestDir: document.getElementById('popover-test-dir'),
    inputTestDir: document.getElementById('input-test-dir'),
    btnBrowseDir: document.getElementById('btn-browse-dir'),
    btnResetDir: document.getElementById('btn-reset-dir'),
    btnApplyDir: document.getElementById('btn-apply-dir'),
    resultsModal: document.getElementById('results-modal'),
    resultsSubtitle: document.getElementById('results-run-subtitle'),
    resultsStatusBadge: document.getElementById('results-status-badge'),
    resultsDuration: document.getElementById('results-duration'),
    kpiTotal: document.getElementById('kpi-total'),
    kpiPassed: document.getElementById('kpi-passed'),
    kpiFailed: document.getElementById('kpi-failed'),
    kpiSkipped: document.getElementById('kpi-skipped'),
    resultsDetails: document.getElementById('results-details'),
    resultsLogsSection: document.getElementById('results-logs-section'),
    resultsLogsCount: document.getElementById('results-logs-count'),
    resultsLogsPre: document.getElementById('results-logs-pre'),
    btnCloseResults: document.getElementById('btn-close-results'),
    btnDoneResults: document.getElementById('btn-done-results')
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function stripAnsi(text) {
    return String(text || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  function appendLogChunk(preEl, chunk, stream) {
    if (!preEl || chunk === undefined || chunk === null) return;
    const clean = stripAnsi(chunk);
    const lines = clean.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line && i === lines.length - 1) continue;
      const lineClass = stream === 'stderr' || /error|failed|denied|stopped|cancelled/i.test(line)
        ? 'log-line log-line-err'
        : (/passed|allowed: true|connected|completed/i.test(line) ? 'log-line log-line-ok' : 'log-line');
      preEl.appendChild(el('div', lineClass, line || ' '));
    }
    preEl.scrollTop = preEl.scrollHeight;
  }

  function detectProviderFromKey(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key) return null;
    if (key.startsWith('sk-ant-')) return 'anthropic';
    if (key.startsWith('AIza')) return 'google';
    if (key.startsWith('sk-')) return 'openai';
    return null;
  }

  function getAgentMeta(agentId) {
    return state.agents.find(a => a.id === agentId) || state.agents[0] || FALLBACK_AGENTS[0];
  }

  function getProviderMeta(providerId) {
    return state.providers.find(p => p.id === providerId) || null;
  }

  function closeAllPopovers() {
    for (const id of ['popover-agent', 'popover-model-key', 'popover-test-dir']) {
      document.getElementById(id).classList.add('hidden');
    }
    els.btnAgent.setAttribute('aria-expanded', 'false');
    els.btnModelKey.setAttribute('aria-expanded', 'false');
    els.btnTestDir.setAttribute('aria-expanded', 'false');
    state.openPopover = null;
  }

  function openPopover(popoverId) {
    const wasOpen = state.openPopover === popoverId;
    closeAllPopovers();
    if (wasOpen) return;

    document.getElementById(popoverId).classList.remove('hidden');
    state.openPopover = popoverId;

    if (popoverId === 'popover-agent') {
      els.btnAgent.setAttribute('aria-expanded', 'true');
    } else if (popoverId === 'popover-model-key') {
      els.btnModelKey.setAttribute('aria-expanded', 'true');
      const agent = getAgentMeta(state.selectedAgent);
      els.modelKeyTitle.textContent = `Model Key · ${agent.name}`;
      syncLlmPopoverControls();
    } else if (popoverId === 'popover-test-dir') {
      els.btnTestDir.setAttribute('aria-expanded', 'true');
      els.inputTestDir.focus();
    }
  }

  function renderAgents() {
    els.agentList.textContent = '';
    for (const agent of state.agents) {
      const btn = el('button', 'agent-option' + (agent.id === state.selectedAgent ? ' is-active' : ''));
      btn.type = 'button';

      const top = el('div', 'agent-option-top');
      top.appendChild(el('span', null, agent.name));
      if (agent.badge) top.appendChild(el('span', 'badge', agent.badge));
      btn.appendChild(top);

      if (agent.description) {
        btn.appendChild(el('span', 'agent-option-desc', agent.description));
      }

      btn.addEventListener('click', () => {
        state.selectedAgent = agent.id;
        updateToolbarLabels();
        renderAgents();
        updateMobileVisibility();
        if (agent.id !== 'mobile-agent') {
          openPopover('popover-model-key');
        }
      });

      els.agentList.appendChild(btn);
    }
    updateMobileVisibility();
  }

  function updateMobileVisibility() {
    const isMobile = state.selectedAgent === 'mobile-agent';
    els.mobileOptions.classList.toggle('hidden', !isMobile);
  }

  function populateModelOptions(providerId, preferredModel) {
    els.selectLlmModel.textContent = '';
    if (providerId === 'free') {
      const opt = el('option', null, 'Free AI · Live DOM Inspector');
      opt.value = 'atom-free-dom';
      els.selectLlmModel.appendChild(opt);
      return;
    }
    const meta = getProviderMeta(providerId);
    if (!meta) {
      const opt = el('option', null, 'Built-in Fallback');
      opt.value = 'atom-template';
      els.selectLlmModel.appendChild(opt);
      return;
    }

    for (const modelName of meta.models) {
      const opt = el('option', null, modelName);
      opt.value = modelName;
      if (preferredModel && preferredModel === modelName) {
        opt.selected = true;
      }
      els.selectLlmModel.appendChild(opt);
    }

    if (!preferredModel || !meta.models.includes(preferredModel)) {
      els.selectLlmModel.value = meta.defaultModel;
    }
  }

  function syncLlmPopoverControls() {
    const { provider, model, configuredProviders, maskedKeys } = state.llmState || {};
    const effectiveProvider = provider && provider !== 'auto' ? provider : 'free';
    els.selectLlmProvider.value = effectiveProvider;
    populateModelOptions(effectiveProvider, model);

    const hasSavedForProvider = Boolean(configuredProviders && configuredProviders[effectiveProvider]);
    const masked = (maskedKeys && maskedKeys[effectiveProvider]) || '';
    if (hasSavedForProvider && masked) {
      els.savedKeyStatus.textContent = `Saved key: ${masked}`;
      els.savedKeyStatus.classList.remove('hidden');
      els.btnClearLlm.classList.remove('hidden');
    } else {
      els.savedKeyStatus.textContent = '';
      els.savedKeyStatus.classList.add('hidden');
      els.btnClearLlm.classList.add('hidden');
    }
  }

  function updateToolbarLabels() {
    const agent = getAgentMeta(state.selectedAgent);
    els.labelAgent.textContent = agent.name;

    const llm = state.llmState || {};
    const providerMeta = getProviderMeta(llm.provider);
    if (providerMeta && llm.hasKey) {
      const shortModel = llm.model || providerMeta.defaultModel;
      els.labelModelKey.textContent = `${providerMeta.name.split(' ')[0]} · ${shortModel}`;
      els.btnModelKey.classList.add('is-configured');
    } else if ((llm.provider || 'free') === 'free') {
      els.labelModelKey.textContent = 'Free AI';
      els.btnModelKey.classList.remove('is-configured');
    } else {
      els.labelModelKey.textContent = 'Model Key';
      els.btnModelKey.classList.remove('is-configured');
    }

    const folderText = String(state.folder || '').trim() || 'atom';
    els.labelTestDir.textContent = folderText.endsWith('/') ? folderText : `${folderText}/`;
    els.btnTestDir.classList.toggle('is-configured', folderText !== 'atom');
  }

  function updateActiveFileChip() {
    if (state.includeActiveFile && state.activeFile?.relativePath) {
      els.activeFileChip.textContent = `@ ${state.activeFile.relativePath}`;
      els.activeFileRow.classList.remove('hidden');
    } else {
      els.activeFileRow.classList.add('hidden');
    }
  }

  function updateSendButtonState() {
    els.btnSend.disabled = !els.prompt.value.trim();
  }

  function autoResizePrompt() {
    els.prompt.style.height = 'auto';
    els.prompt.style.height = `${Math.min(140, Math.max(36, els.prompt.scrollHeight))}px`;
  }

  function scrollCanvasToBottom() {
    els.canvas.classList.toggle('has-messages', els.thread.children.length > 0);
    els.canvas.scrollTop = els.canvas.scrollHeight;
  }

  function appendUserBubble(text) {
    const bubble = el('div', 'msg-user', text);
    els.thread.appendChild(bubble);
    scrollCanvasToBottom();
  }

  function appendLoadingCard(text) {
    const card = el('div', 'msg-assistant is-loading', text);
    els.thread.appendChild(card);
    state.pendingCardEl = card;
    scrollCanvasToBottom();
    return card;
  }

  function replacePendingWithError(message) {
    const errCard = el('div', 'msg-assistant is-error', message || 'Operation failed');
    if (state.pendingCardEl && state.pendingCardEl.parentNode) {
      state.pendingCardEl.replaceWith(errCard);
    } else {
      els.thread.appendChild(errCard);
    }
    state.pendingCardEl = null;
    if (state.activeExecuteBtn) {
      state.activeExecuteBtn.disabled = false;
      state.activeExecuteBtn.textContent = '▶ Execute';
      state.activeExecuteBtn = null;
    }
    for (const [, ctx] of state.activeExecutions) {
      ctx.executeBtn.disabled = false;
      ctx.executeBtn.textContent = '▶ Execute';
      ctx.stopBtn.disabled = false;
      ctx.stopBtn.textContent = '■ Stop';
      ctx.stopBtn.classList.add('hidden');
      ctx.execText.textContent = `Execution error: ${message || 'Failed'}`;
    }
    state.activeExecutions.clear();
    scrollCanvasToBottom();
  }

  function renderGeneratedCard(created) {
    const test = created?.test || {};
    const saved = created?.saved || {};
    const policy = created?.policy || {};
    const savedFile = saved.relativePath || test.savedFile || '';
    const testId = saved.testId || test.id || '';
    const generation = test.metadata || test.generation || {};
    const inspected = created?.inspectedDom || test?.metadata?.inspectedDom || null;

    const card = el('div', 'msg-assistant');

    const metaRow = el('div', 'card-meta-row');
    const badges = el('div', 'card-badges');
    badges.appendChild(el('span', 'badge badge-accent', created?.agent?.name || getAgentMeta(state.selectedAgent).name));
    if (generation.provider && generation.provider !== 'fallback') {
      const providerLabel = generation.provider === 'free' && generation.model === 'dom-inspector'
        ? 'Free AI · Live DOM'
        : `${generation.provider} · ${generation.model}`;
      badges.appendChild(el('span', 'badge', providerLabel));
    }
    if (inspected) {
      badges.appendChild(
        el('span', 'badge badge-accent', `Inspected · ${inspected.inputsCount ?? 0} inputs`)
      );
    }
    badges.appendChild(
      el('span', policy.allowed === false ? 'badge badge-fail' : 'badge badge-ok', policy.allowed === false ? 'Policy Warning' : 'Policy Allowed')
    );
    metaRow.appendChild(badges);
    card.appendChild(metaRow);

    if (savedFile) {
      const pathRow = el('div', 'saved-path-row');
      pathRow.appendChild(el('span', 'saved-path-label', `Saved: ${savedFile}`));
      const openBtn = el('button', 'ghost-mini-btn', 'Open');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openFile', payload: { filePath: savedFile } });
      });
      pathRow.appendChild(openBtn);
      card.appendChild(pathRow);
    }

    const codeWrap = el('div', 'code-block-wrap');
    const codeHeader = el('div', 'code-block-header');
    codeHeader.appendChild(el('span', null, `${test.testType || 'ui'} · generated code`));
    const headerActions = el('div', 'code-block-header-actions');
    const copyBtn = el('button', 'ghost-mini-btn', 'Copy');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyCode', payload: { code: test.code || '' } });
    });
    headerActions.appendChild(copyBtn);
    codeHeader.appendChild(headerActions);
    codeWrap.appendChild(codeHeader);

    const pre = el('pre', 'code-pre');
    pre.appendChild(el('code', null, test.code || '// Empty test generated'));
    codeWrap.appendChild(pre);
    card.appendChild(codeWrap);

    const execBar = el('div', 'execute-prompt-bar');
    const execText = el('span', 'execute-prompt-text', 'Ready to execute this test?');
    const execActions = el('div', 'execute-prompt-actions');

    const logsToggleBtn = el('button', 'ghost-mini-btn hidden', 'Hide Logs');
    logsToggleBtn.type = 'button';

    const viewResultsBtn = el('button', 'ghost-mini-btn hidden', 'View Results');
    viewResultsBtn.type = 'button';

    const stopBtn = el('button', 'btn-stop hidden', '■ Stop');
    stopBtn.type = 'button';

    const executeBtn = el('button', 'btn-execute', '▶ Execute');
    executeBtn.type = 'button';
    executeBtn.dataset.testId = testId;
    executeBtn.dataset.filePath = savedFile;

    const logsPanel = el('div', 'exec-logs-panel hidden');
    const logsHeader = el('div', 'exec-logs-header');
    logsHeader.appendChild(el('span', null, 'Execution Logs'));
    const logsHeaderActions = el('div', 'exec-logs-header-actions');
    const clearLogsBtn = el('button', 'ghost-mini-btn', 'Clear');
    clearLogsBtn.type = 'button';
    const hideLogsBtn = el('button', 'ghost-mini-btn', 'Hide');
    hideLogsBtn.type = 'button';
    logsHeaderActions.appendChild(clearLogsBtn);
    logsHeaderActions.appendChild(hideLogsBtn);
    logsHeader.appendChild(logsHeaderActions);
    const logsPre = el('pre', 'exec-logs-pre');
    logsPanel.appendChild(logsHeader);
    logsPanel.appendChild(logsPre);

    let currentExecutionToken = null;

    clearLogsBtn.addEventListener('click', () => {
      logsPre.textContent = '';
    });

    const toggleLogs = () => {
      const nextHidden = !logsPanel.classList.contains('hidden');
      logsPanel.classList.toggle('hidden', nextHidden);
      logsToggleBtn.textContent = nextHidden ? 'Logs' : 'Hide Logs';
    };

    logsToggleBtn.addEventListener('click', toggleLogs);
    hideLogsBtn.addEventListener('click', toggleLogs);

    executeBtn.addEventListener('click', () => {
      const executionToken = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      currentExecutionToken = executionToken;
      const ctx = {
        executionToken,
        testId,
        filePath: savedFile,
        executeBtn,
        stopBtn,
        viewResultsBtn,
        logsToggleBtn,
        execText,
        logsPanel,
        logsPre,
        liveCount: 0
      };
      state.activeExecutions.set(executionToken, ctx);
      state.lastExecutionContext = ctx;

      executeBtn.disabled = true;
      executeBtn.textContent = 'Executing...';
      stopBtn.disabled = false;
      stopBtn.textContent = '■ Stop';
      stopBtn.classList.remove('hidden');
      execText.textContent = 'Executing test...';
      logsToggleBtn.classList.remove('hidden');
      logsToggleBtn.textContent = 'Hide Logs';
      logsPanel.classList.remove('hidden');
      logsPre.textContent = '';
      appendLogChunk(logsPre, `[Atom] Starting execution for ${savedFile || testId || 'test'}...`, 'stdout');

      state.activeExecuteBtn = executeBtn;
      state.activeViewResultsBtn = viewResultsBtn;
      state.activeExecText = execText;
      vscode.postMessage({
        type: 'executeTest',
        payload: {
          testId: testId || undefined,
          filePath: savedFile || undefined,
          executionToken
        }
      });
      scrollCanvasToBottom();
    });

    stopBtn.addEventListener('click', () => {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping...';
      execText.textContent = 'Stopping execution...';
      appendLogChunk(logsPre, '[Atom] Stop requested by user...', 'stderr');
      vscode.postMessage({
        type: 'stopExecution',
        payload: {
          executionToken: currentExecutionToken || undefined
        }
      });
    });

    viewResultsBtn.addEventListener('click', () => {
      const recorded = state.executionsByBtn.get(viewResultsBtn);
      if (recorded) showResultsModal(recorded);
    });

    execActions.appendChild(logsToggleBtn);
    execActions.appendChild(viewResultsBtn);
    execActions.appendChild(stopBtn);
    execActions.appendChild(executeBtn);
    execBar.appendChild(execText);
    execBar.appendChild(execActions);
    card.appendChild(execBar);
    card.appendChild(logsPanel);

    if (state.pendingCardEl && state.pendingCardEl.parentNode) {
      state.pendingCardEl.replaceWith(card);
    } else {
      els.thread.appendChild(card);
    }
    state.pendingCardEl = null;
    scrollCanvasToBottom();
  }

  function addResultDetailRow(label, value, isError) {
    const row = el('div', 'result-row');
    row.appendChild(el('span', 'result-row-label', label));
    row.appendChild(el('span', isError ? 'result-row-value result-row-error' : 'result-row-value', value));
    els.resultsDetails.appendChild(row);
  }

  function showResultsModal(execution) {
    if (!execution) return;
    const summary = execution.summary || {};
    const status = String(execution.status || 'unknown').toLowerCase();
    const isPassed = status === 'passed';
    const isCancelled = status === 'cancelled';

    els.resultsStatusBadge.textContent = isPassed ? 'PASSED' : status.toUpperCase();
    els.resultsStatusBadge.className = 'status-pill ' + (isPassed ? 'is-passed' : (isCancelled ? 'is-cancelled' : 'is-failed'));
    els.resultsDuration.textContent = `${Number(execution.duration || 0)} ms`;
    els.resultsSubtitle.textContent = execution.savedFile || execution.runId || 'Execution results';

    els.kpiTotal.textContent = String(summary.testCount ?? 0);
    els.kpiPassed.textContent = String(summary.passedCount ?? 0);
    els.kpiFailed.textContent = String(summary.failedCount ?? 0);
    els.kpiSkipped.textContent = String(summary.skippedCount ?? 0);

    els.resultsDetails.textContent = '';
    addResultDetailRow('Run ID', execution.runId || '—', false);
    addResultDetailRow('Runner', execution.runner || '—', false);
    addResultDetailRow('Saved File', execution.savedFile || '—', false);
    addResultDetailRow('Exit Code', execution.exitCode === undefined ? '—' : String(execution.exitCode), !isPassed);
    if (execution.error) {
      addResultDetailRow('Error', execution.error, true);
    }
    if (execution.remediation) {
      addResultDetailRow('Note', execution.remediation, false);
    }

    if (els.resultsLogsPre && els.resultsLogsSection && els.resultsLogsCount) {
      els.resultsLogsPre.textContent = '';
      const rawLogs = Array.isArray(execution.logs) ? execution.logs : [];
      let lineCount = 0;
      for (const entry of rawLogs) {
        const text = typeof entry === 'string' ? entry : (entry?.content || '');
        if (!text) continue;
        appendLogChunk(els.resultsLogsPre, text, entry?.stream || 'stdout');
      }
      lineCount = els.resultsLogsPre.childElementCount;
      if (lineCount === 0) {
        appendLogChunk(els.resultsLogsPre, '[Atom] No output logs captured for this run.', 'stdout');
        lineCount = 1;
      }
      els.resultsLogsCount.textContent = `${lineCount} line${lineCount === 1 ? '' : 's'}`;
      els.resultsLogsSection.classList.remove('hidden');
    }

    els.resultsModal.classList.remove('hidden');
  }

  function closeResultsModal() {
    els.resultsModal.classList.add('hidden');
  }

  function readDraftLlmPayload() {
    const draftKey = els.inputApiKey.value.trim();
    const draftProvider = els.selectLlmProvider.value;
    const draftModel = els.selectLlmModel.value;
    if (draftKey) {
      return {
        provider: draftProvider,
        model: draftModel,
        apiKey: draftKey
      };
    }
    return {
      provider: state.llmState.provider || draftProvider,
      model: state.llmState.model || draftModel
    };
  }

  function handleSend() {
    const prompt = els.prompt.value.trim();
    if (!prompt) return;

    closeAllPopovers();
    appendUserBubble(prompt);
    appendLoadingCard('Generating test...');

    const folder = String(els.inputTestDir.value || state.folder || '').trim();
    const agent = state.selectedAgent || 'ui-agent';
    const agentMeta = getAgentMeta(agent);
    const llm = readDraftLlmPayload();

    if (draftKeyInputHasText()) {
      els.inputApiKey.value = '';
    }

    els.prompt.value = '';
    autoResizePrompt();
    updateSendButtonState();

    vscode.postMessage({
      type: 'generateTest',
      payload: {
        prompt,
        agent,
        testType: agentMeta.defaultTestType,
        folder,
        includeActiveFile: state.includeActiveFile,
        mobilePlatform: els.selectMobilePlatform.value,
        mobileDeviceName: els.inputMobileDevice.value.trim(),
        llm
      }
    });
  }

  function draftKeyInputHasText() {
    return Boolean(els.inputApiKey.value.trim());
  }

  // Event wiring
  els.prompt.addEventListener('input', () => {
    autoResizePrompt();
    updateSendButtonState();
  });

  els.prompt.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!els.btnSend.disabled) {
        handleSend();
      }
    }
  });

  if (els.btnNewWindow) {
    els.btnNewWindow.addEventListener('click', () => {
      vscode.postMessage({ type: 'newWindow' });
    });
  }

  els.btnSend.addEventListener('click', handleSend);

  els.btnAttach.addEventListener('click', () => {
    state.includeActiveFile = !state.includeActiveFile;
    if (state.includeActiveFile && !state.activeFile?.relativePath) {
      state.includeActiveFile = false;
    }
    updateActiveFileChip();
  });

  els.btnRemoveActiveFile.addEventListener('click', () => {
    state.includeActiveFile = false;
    updateActiveFileChip();
  });

  els.btnAgent.addEventListener('click', () => openPopover('popover-agent'));
  els.btnModelKey.addEventListener('click', () => openPopover('popover-model-key'));
  els.btnTestDir.addEventListener('click', () => openPopover('popover-test-dir'));

  document.querySelectorAll('[data-close-popover]').forEach(btn => {
    btn.addEventListener('click', closeAllPopovers);
  });

  els.selectLlmProvider.addEventListener('change', () => {
    const providerId = els.selectLlmProvider.value;
    populateModelOptions(providerId, '');
  });

  els.inputApiKey.addEventListener('input', () => {
    const detected = detectProviderFromKey(els.inputApiKey.value);
    if (detected && ['auto', 'free', 'fallback'].includes(els.selectLlmProvider.value)) {
      els.selectLlmProvider.value = detected;
      populateModelOptions(detected, '');
    } else if (detected && els.selectLlmProvider.value !== detected) {
      els.selectLlmProvider.value = detected;
      populateModelOptions(detected, '');
    }
  });

  els.btnToggleKeyVis.addEventListener('click', () => {
    const showing = els.inputApiKey.type === 'text';
    els.inputApiKey.type = showing ? 'password' : 'text';
    els.btnToggleKeyVis.textContent = showing ? 'Show' : 'Hide';
  });

  els.btnMobileNext.addEventListener('click', () => openPopover('popover-model-key'));

  els.btnSaveLlm.addEventListener('click', () => {
    const apiKey = els.inputApiKey.value.trim();
    const provider = els.selectLlmProvider.value;
    const model = els.selectLlmModel.value;
    els.inputApiKey.value = '';
    vscode.postMessage({
      type: 'saveLlmConfig',
      payload: { provider, model, apiKey }
    });
    closeAllPopovers();
  });

  els.inputApiKey.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.btnSaveLlm.click();
    }
  });

  els.inputTestDir.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.btnApplyDir.click();
    }
  });

  els.btnClearLlm.addEventListener('click', () => {
    els.inputApiKey.value = '';
    vscode.postMessage({
      type: 'clearLlmKey',
      payload: { provider: els.selectLlmProvider.value }
    });
  });

  els.inputTestDir.addEventListener('input', () => {
    state.folder = els.inputTestDir.value.trim() || 'atom';
    updateToolbarLabels();
  });

  els.btnBrowseDir.addEventListener('click', () => {
    vscode.postMessage({ type: 'pickTestDir' });
  });

  els.btnResetDir.addEventListener('click', () => {
    state.folder = 'atom';
    els.inputTestDir.value = 'atom';
    updateToolbarLabels();
  });

  els.btnApplyDir.addEventListener('click', () => {
    state.folder = els.inputTestDir.value.trim() || 'atom';
    updateToolbarLabels();
    closeAllPopovers();
  });

  els.btnCloseResults.addEventListener('click', closeResultsModal);
  els.btnDoneResults.addEventListener('click', closeResultsModal);
  els.resultsModal.addEventListener('click', event => {
    if (event.target === els.resultsModal) closeResultsModal();
  });

  document.addEventListener('click', event => {
    if (!state.openPopover) return;
    const dock = document.querySelector('.composer-dock');
    if (dock && !dock.contains(event.target)) {
      closeAllPopovers();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAllPopovers();
      closeResultsModal();
    }
  });

  window.addEventListener('message', event => {
    const { type, payload } = event.data || {};
    switch (type) {
      case 'stateInit': {
        if (!payload?.connected) {
          els.bannerText.textContent = payload?.error
            ? `Atom MCP offline: ${payload.error}`
            : 'Connecting to Atom MCP...';
          els.banner.classList.remove('hidden');
        } else {
          els.banner.classList.add('hidden');
        }

        if (Array.isArray(payload?.capabilities?.agents) && payload.capabilities.agents.length > 0) {
          state.agents = payload.capabilities.agents;
        }
        if (Array.isArray(payload?.capabilities?.llmProviders) && payload.capabilities.llmProviders.length > 0) {
          state.providers = payload.capabilities.llmProviders;
        }
        if (payload?.settings?.defaultAgent && state.agents.some(a => a.id === payload.settings.defaultAgent)) {
          state.selectedAgent = payload.settings.defaultAgent;
        }
        if (payload?.settings?.defaultFolder) {
          state.folder = payload.settings.defaultFolder;
          els.inputTestDir.value = state.folder;
        }
        state.activeFile = payload?.activeFile || null;
        if (payload?.llmState) {
          state.llmState = payload.llmState;
        }

        renderAgents();
        updateToolbarLabels();
        updateActiveFileChip();
        break;
      }

      case 'llmStateUpdated': {
        if (payload) {
          state.llmState = payload;
          updateToolbarLabels();
          syncLlmPopoverControls();
        }
        break;
      }

      case 'testDirPicked': {
        if (payload?.folder) {
          state.folder = payload.folder;
          els.inputTestDir.value = payload.folder;
          updateToolbarLabels();
        }
        break;
      }

      case 'activeEditorChanged':
      case 'activeFileChanged': {
        state.activeFile = payload || null;
        updateActiveFileChip();
        break;
      }

      case 'generationCompleted': {
        if (payload?.llmState) {
          state.llmState = payload.llmState;
          updateToolbarLabels();
        }
        renderGeneratedCard(payload?.created);
        break;
      }

      case 'executionStarted': {
        const ctx = (payload?.executionToken && state.activeExecutions.get(payload.executionToken)) || state.lastExecutionContext;
        if (ctx) {
          ctx.stopBtn.classList.remove('hidden');
          ctx.stopBtn.disabled = false;
          ctx.stopBtn.textContent = '■ Stop';
          ctx.logsPanel.classList.remove('hidden');
          ctx.logsToggleBtn.classList.remove('hidden');
          ctx.logsToggleBtn.textContent = 'Hide Logs';
        }
        break;
      }

      case 'mcpExecutionLog': {
        const ctx = (payload?.executionToken && state.activeExecutions.get(payload.executionToken)) || state.lastExecutionContext;
        if (ctx && payload?.content) {
          ctx.logsPanel.classList.remove('hidden');
          ctx.logsToggleBtn.classList.remove('hidden');
          appendLogChunk(ctx.logsPre, payload.content, payload.stream || 'stdout');
          ctx.liveCount = (ctx.liveCount || 0) + 1;
          scrollCanvasToBottom();
        }
        break;
      }

      case 'mcpExecutionState': {
        const ctx = (payload?.executionToken && state.activeExecutions.get(payload.executionToken)) || state.lastExecutionContext;
        if (ctx && payload?.state && !['passed', 'failed'].includes(payload.state)) {
          ctx.execText.textContent = payload.state === 'cancelled'
            ? 'Stopping execution...'
            : `Running (${payload.state})...`;
        }
        break;
      }

      case 'executionStopping': {
        const ctx = (payload?.executionToken && state.activeExecutions.get(payload.executionToken)) || state.lastExecutionContext;
        if (ctx) {
          ctx.stopBtn.disabled = true;
          ctx.stopBtn.textContent = 'Stopping...';
        }
        break;
      }

      case 'executionCompleted': {
        const execution = payload?.execution;
        if (execution) {
          const ctx = (payload?.executionToken && state.activeExecutions.get(payload.executionToken)) || state.lastExecutionContext;
          if (ctx) {
            ctx.executeBtn.disabled = false;
            ctx.executeBtn.textContent = '▶ Re-run';
            ctx.stopBtn.disabled = false;
            ctx.stopBtn.textContent = '■ Stop';
            ctx.stopBtn.classList.add('hidden');
            state.executionsByBtn.set(ctx.viewResultsBtn, execution);
            ctx.viewResultsBtn.classList.remove('hidden');
            ctx.logsToggleBtn.classList.remove('hidden');
            ctx.logsToggleBtn.textContent = 'Hide Logs';
            ctx.logsPanel.classList.remove('hidden');

            const allLogs = Array.isArray(execution.logs) ? execution.logs : [];
            const missingLogs = allLogs.slice(ctx.liveCount || 0);
            for (const entry of missingLogs) {
              const text = typeof entry === 'string' ? entry : entry?.content;
              if (text) {
                appendLogChunk(ctx.logsPre, text, entry?.stream || 'stdout');
              }
            }

            const statusLower = String(execution.status || '').toLowerCase();
            ctx.execText.textContent = statusLower === 'passed'
              ? 'Last run passed'
              : (statusLower === 'cancelled' ? 'Execution cancelled' : `Last run ${execution.status || 'failed'}`);
            if (payload?.executionToken) {
              state.activeExecutions.delete(payload.executionToken);
            }
          }

          if (state.activeExecuteBtn && (!ctx || state.activeExecuteBtn !== ctx.executeBtn)) {
            state.activeExecuteBtn.disabled = false;
            state.activeExecuteBtn.textContent = '▶ Re-run';
          }
          state.activeExecuteBtn = null;
          state.activeViewResultsBtn = null;
          state.activeExecText = null;
          showResultsModal(execution);
        }
        break;
      }

      case 'error': {
        replacePendingWithError(payload?.message || 'Unexpected error');
        break;
      }
    }
  });

  renderAgents();
  updateToolbarLabels();
  vscode.postMessage({ type: 'ready' });
})();
