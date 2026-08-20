const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { TERMINAL_STATES } = require('./persistence');
const { deliverWebhook } = require('./signedWebhook');

class RunService {
  constructor({ store, queue, executor, streaming, objectStorage, config, logger }) {
    this.store = store; this.queue = queue; this.executor = executor; this.streaming = streaming; this.objectStorage = objectStorage; this.config = config; this.logger = logger;
    this.cancelled = new Set();
    this.queue.registerHandler(async job => this.processJob(job.data.runId, job.data));
  }

  async emit(run, type, payload = {}) {
    const tenantId = run.tenant_id || run.tenantId;
    const event = await this.store.appendEvent(run.id, tenantId, type, { runId: run.id, sessionId: run.session_id || run.sessionId, ...payload });
    // The focused run channel remains authorized through subscribe-run. It may
    // carry the bounded lifecycle payload required by an authorized run detail.
    const runChannel = typeof this.streaming.runChannel === 'function' ? this.streaming.runChannel(run.id) : `run-${run.id}`;
    const tenantChannel = typeof this.streaming.tenantChannel === 'function' ? this.streaming.tenantChannel(tenantId) : `tenant-${tenantId}`;
    this.streaming.sendToChannel(runChannel, { ...event.payload, type, sequence: event.sequence });
    // Tenant-wide dashboards receive only an invalidation signal. Never place
    // result data, session IDs, executor output, artifacts, or secrets here.
    this.streaming.sendToChannel(tenantChannel, {
      type: 'dashboard.run-state-changed',
      runId: run.id,
      state: type.replace(/^run\./, ''),
      sequence: event.sequence,
      occurredAt: event.created_at || new Date().toISOString()
    });
    return event;
  }

  async submit({ tenantId, userId, projectId, testData, sessionId, idempotencyKey, correlationId }) {
    const quota = await this.store.getDashboard(tenantId);
    if (quota.totalRuns >= this.config.quotas.maxRunsPerTenant) throw new Error('tenant_run_quota_exceeded');
    const { run, created } = await this.store.createRun({ tenantId, userId, projectId, testData, sessionId: sessionId || `session-${Date.now()}`, idempotencyKey: idempotencyKey || uuidv4() });
    if (!created) return { run, replayed: true };
    await this.store.recordAudit({ tenantId, actorId: userId, action: 'run.requested', resourceType: 'run', resourceId: run.id, metadata: { correlationId, idempotencyKey: run.idempotency_key } });
    await this.store.transitionRun(run.id, tenantId, 'validated');
    const queued = await this.store.transitionRun(run.id, tenantId, 'queued');
    await this.emit(queued, 'run.queued', { correlationId });
    await this.queue.enqueue(run.id, { tenantId, userId, testData, sessionId: run.session_id, correlationId });
    return { run: queued, replayed: false };
  }

  async ingestArtifacts(run, result) {
    const artifacts = [];
    const retentionUntil = new Date(Date.now() + this.config.quotas.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    for (const [kind, entries] of Object.entries(result.artifacts || {})) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry.path || !(await fs.pathExists(entry.path))) continue;
        const objectKey = `${run.tenant_id}/${run.id}/${kind}/${path.basename(entry.path)}`;
        const stored = await this.objectStorage.putFile(objectKey, entry.path, entry.contentType || 'application/octet-stream');
        const artifact = await this.store.createArtifact({ tenantId: run.tenant_id, runId: run.id, objectKey: stored.key, contentType: entry.contentType || 'application/octet-stream', sizeBytes: entry.size || 0, retentionUntil });
        artifacts.push({ id: artifact.id, kind, objectKey: stored.key, retentionUntil });
      }
    }
    return artifacts;
  }

  async processJob(runId, payload) {
    let run = await this.store.getRun(runId, payload.tenantId);
    if (!run || TERMINAL_STATES.has(run.state)) return run;
    run = await this.store.transitionRun(run.id, payload.tenantId, 'assigned'); await this.emit(run, 'run.assigned');
    if (run.cancel_requested || this.cancelled.has(run.id)) return this.cancel(run.id, payload.tenantId, 'cancelled_before_start');
    run = await this.store.transitionRun(run.id, payload.tenantId, 'running'); await this.emit(run, 'run.started');
    try {
      const runStreaming = {
        broadcast: message => this.streaming.sendToChannel(typeof this.streaming.runChannel === 'function' ? this.streaming.runChannel(run.id) : `run-${run.id}`, message)
      };
      const result = await this.executor.executeTest(payload.testData, payload.sessionId, runStreaming);
      if (this.cancelled.has(run.id)) return this.cancel(run.id, payload.tenantId, 'cancelled');
      const storedArtifacts = await this.ingestArtifacts(run, result);
      result.artifacts = storedArtifacts;
      run = await this.store.transitionRun(run.id, payload.tenantId, 'collecting_artifacts', { result }); await this.emit(run, 'run.collecting_artifacts', { result });
      const finalState = result.status === 'passed' ? 'passed' : 'failed';
      run = await this.store.transitionRun(run.id, payload.tenantId, finalState, { result });
      await this.store.recordQuota(payload.tenantId, (result.duration || 0) / 1000);
      await this.emit(run, `run.${finalState}`, { result });
      await this.store.recordAudit({ tenantId: payload.tenantId, actorId: payload.userId, action: `run.${finalState}`, resourceType: 'run', resourceId: run.id, metadata: { correlationId: payload.correlationId } });
      if (this.config.webhooks.deliveryUrl && this.config.webhooks.signingSecret) {
        try { await deliverWebhook(this.config.webhooks.deliveryUrl, { type: `run.${finalState}`, runId: run.id, tenantId: payload.tenantId, result }, this.config); }
        catch (webhookError) { await this.store.recordAudit({ tenantId: payload.tenantId, actorId: 'system', action: 'webhook.delivery_failed', resourceType: 'run', resourceId: run.id, metadata: { error: webhookError.message } }); }
      }
      return run;
    } catch (error) {
      run = await this.store.transitionRun(run.id, payload.tenantId, 'failed', { result: { error: error.message } });
      await this.emit(run, 'run.failed', { error: 'execution_failed' });
      throw error;
    }
  }

  async cancel(runId, tenantId, reason = 'cancel_requested') {
    this.cancelled.add(runId);
    await this.queue.cancel(runId);
    if (typeof this.executor.cancelExecution === 'function') this.executor.cancelExecution((await this.store.getRun(runId, tenantId))?.session_id);
    const current = await this.store.getRun(runId, tenantId);
    if (!current || TERMINAL_STATES.has(current.state)) return current;
    const run = await this.store.requestCancel(runId, tenantId);
    await this.emit(run, 'run.cancelled', { reason });
    await this.store.recordAudit({ tenantId, actorId: 'system', action: 'run.cancelled', resourceType: 'run', resourceId: runId, metadata: { reason } });
    return run;
  }

  async replay(runId, tenantId, after = 0) { return this.store.listEvents(runId, tenantId, after); }
}

module.exports = RunService;
