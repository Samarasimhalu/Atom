(() => {
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

  const wait = (milliseconds) => new Promise(resolve => window.setTimeout(resolve, prefersReducedMotion ? 0 : milliseconds));
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
    appendLog('Simulation ready. No network requests will be sent.', 'note');
  }

  async function run() {
    if (startButton.disabled) return;
    currentRunId = safeRunId();
    startedAt = Date.now();
    currentEvidence = null;
    logEvents = [];
    setExportAvailability(false);
    startButton.disabled = true;
    startButton.textContent = 'Running simulation…';
    log.replaceChildren();
    const auth = currentAuth();
    refreshAuthIndicator();
    setState('Validating declarative plan', 'running');
    setPhase(0, 'active');
    appendLog(`Synthetic run ${currentRunId} started`, 'note');
    appendLog('api-test-plan/v1 structure accepted', 'success');
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
})();
