(() => {
  const runner = document.querySelector('[data-test-runner]');
  if (!runner) return;

  const startButton = runner.querySelector('[data-runner-start]');
  const resetButton = runner.querySelector('[data-runner-reset]');
  const stateLabel = runner.querySelector('[data-runner-state]');
  const announcement = runner.querySelector('[data-runner-announcement]');
  const log = runner.querySelector('[data-runner-log]');
  const phaseNodes = [...runner.querySelectorAll('[data-runner-phase]')];
  const stepNodes = [...runner.querySelectorAll('[data-runner-step]')];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeRun = null;

  const steps = [
    { id: 'create-order', request: 'POST /v1/orders', result: '201 Created', detail: 'Assertions passed · orderId extracted (internal)' },
    { id: 'get-order', request: 'GET /v1/orders/{{chain.orderId}}', result: '200 OK', detail: 'Chained request resolved · state asserted' },
    { id: 'verify-evidence', request: 'GET /v1/orders/{{chain.orderId}}/receipt', result: '200 OK', detail: 'Header and JSON-path assertions passed' }
  ];

  const wait = (milliseconds) => new Promise(resolve => window.setTimeout(resolve, prefersReducedMotion ? 0 : milliseconds));

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

  function appendLog(message, kind = 'note') {
    const entry = document.createElement('p');
    entry.className = `runner-log-entry runner-log-${kind}`;
    entry.textContent = message;
    log.append(entry);
    log.scrollTop = log.scrollHeight;
  }

  function reset() {
    if (activeRun) window.clearTimeout(activeRun);
    log.replaceChildren();
    stepNodes.forEach(node => {
      node.dataset.state = 'queued';
      const result = node.querySelector('[data-step-result]');
      if (result) result.textContent = 'Awaiting execution';
    });
    setPhase(0, 'active');
    setState('Ready to simulate', 'idle');
    startButton.disabled = false;
    startButton.textContent = 'Run simulation';
    appendLog('Simulation ready. No network requests will be sent.', 'note');
  }

  async function run() {
    if (startButton.disabled) return;
    startButton.disabled = true;
    startButton.textContent = 'Running simulation…';
    log.replaceChildren();
    setState('Validating declarative plan', 'running');
    setPhase(0, 'active');
    appendLog('✓ api-test-plan/v1 structure accepted', 'success');
    appendLog('✓ Environment allowlist and managed egress gate satisfied', 'success');
    await wait(650);

    setPhase(0, 'complete');
    setPhase(1, 'active');
    setState('Policy and approval checks complete', 'running');
    appendLog('✓ Tenant context, policy binding, and idempotency key verified', 'success');
    await wait(650);

    setPhase(1, 'complete');
    setPhase(2, 'active');
    setState('Executing isolated API plan', 'running');

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const stepNode = stepNodes[index];
      stepNode.dataset.state = 'running';
      const result = stepNode.querySelector('[data-step-result]');
      result.textContent = 'In progress';
      appendLog(`→ ${step.request}`, 'request');
      await wait(800);
      stepNode.dataset.state = 'passed';
      result.textContent = `${step.result} · passed`;
      appendLog(`✓ ${step.id}: ${step.detail}`, 'success');
    }

    setPhase(2, 'complete');
    setPhase(3, 'active');
    setState('Reconciling durable run evidence', 'running');
    appendLog('✓ Safe dashboard invalidation emitted; durable result replay available', 'success');
    await wait(650);
    setPhase(3, 'complete');
    setState('Simulation passed · 3 of 3 steps', 'passed');
    startButton.disabled = false;
    startButton.textContent = 'Run again';
  }

  startButton.addEventListener('click', run);
  resetButton.addEventListener('click', reset);
  reset();
})();
