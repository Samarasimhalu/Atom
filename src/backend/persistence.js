const fs = require('fs-extra');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const RUN_STATES = ['requested', 'validated', 'approved', 'queued', 'assigned', 'running', 'collecting_artifacts', 'passed', 'failed', 'cancelled', 'timed_out'];
const TERMINAL_STATES = new Set(['passed', 'failed', 'cancelled', 'timed_out']);
const TRANSITIONS = {
  requested: ['validated', 'cancelled'], validated: ['approved', 'queued', 'cancelled'], approved: ['queued', 'cancelled'],
  queued: ['assigned', 'cancelled'], assigned: ['running', 'cancelled'], running: ['collecting_artifacts', 'cancelled', 'timed_out'],
  collecting_artifacts: ['passed', 'failed', 'cancelled'], passed: [], failed: [], cancelled: [], timed_out: []
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS atom_runs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT 'default',
  user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, state TEXT NOT NULL,
  test_id TEXT, session_id TEXT NOT NULL, payload JSONB NOT NULL, result JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS atom_runs_tenant_created_idx ON atom_runs(tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS atom_run_events (
  run_id TEXT NOT NULL REFERENCES atom_runs(id) ON DELETE CASCADE, sequence BIGINT NOT NULL,
  tenant_id TEXT NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, sequence)
);
CREATE TABLE IF NOT EXISTS atom_audit_events (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS atom_audit_tenant_created_idx ON atom_audit_events(tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS atom_artifacts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, run_id TEXT NOT NULL, object_key TEXT NOT NULL,
  content_type TEXT NOT NULL, size_bytes BIGINT NOT NULL DEFAULT 0, retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS atom_quota_usage (
  tenant_id TEXT NOT NULL, quota_date DATE NOT NULL, runs INTEGER NOT NULL DEFAULT 0,
  execution_seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (tenant_id, quota_date)
);
`;

class Persistence {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.pool = config.persistence.databaseUrl ? new Pool({ connectionString: config.persistence.databaseUrl, max: config.persistence.poolMax }) : null;
    this.filePath = path.join(config.storage.results, 'enterprise-store.json');
    this.memory = { runs: new Map(), events: new Map(), audit: [], artifacts: new Map(), quotas: new Map(), idempotency: new Map() };
    this.ready = this.initialize();
  }

  async initialize() {
    if (this.pool) {
      await this.pool.query(SCHEMA);
      this.logger.info('persistence.postgres.ready');
      return;
    }
    await fs.ensureDir(path.dirname(this.filePath));
    if (await fs.pathExists(this.filePath)) {
      try {
        const data = await fs.readJson(this.filePath);
        for (const run of data.runs || []) this.memory.runs.set(run.id, run);
        for (const [id, events] of Object.entries(data.events || {})) this.memory.events.set(id, events);
        this.memory.audit = data.audit || [];
        for (const artifact of data.artifacts || []) this.memory.artifacts.set(artifact.id, artifact);
      } catch (error) { this.logger.warn('persistence.local.load_failed', { error: error.message }); }
    }
  }

  async close() { if (this.pool) await this.pool.end(); }

  async flush() {
    if (this.pool) return;
    await fs.writeJson(this.filePath, {
      runs: [...this.memory.runs.values()], events: Object.fromEntries(this.memory.events), audit: this.memory.audit,
      artifacts: [...this.memory.artifacts.values()]
    }, { spaces: 2 });
  }

  async createRun(input) {
    await this.ready;
    if (this.pool) {
      const existing = await this.pool.query('SELECT * FROM atom_runs WHERE tenant_id=$1 AND idempotency_key=$2', [input.tenantId, input.idempotencyKey]);
      if (existing.rows[0]) return { run: existing.rows[0], created: false };
      const id = input.id || uuidv4();
      const result = await this.pool.query(`INSERT INTO atom_runs (id,tenant_id,project_id,user_id,idempotency_key,state,test_id,session_id,payload) VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8) RETURNING *`, [id, input.tenantId, input.projectId || 'default', input.userId, input.idempotencyKey, input.testData.id || null, input.sessionId, input.testData]);
      return { run: result.rows[0], created: true };
    }
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const existingId = this.memory.idempotency.get(key);
    if (existingId) return { run: this.memory.runs.get(existingId), created: false };
    const run = { id: input.id || uuidv4(), tenant_id: input.tenantId, project_id: input.projectId || 'default', user_id: input.userId, idempotency_key: input.idempotencyKey, state: 'requested', test_id: input.testData.id || null, session_id: input.sessionId, payload: input.testData, result: null, cancel_requested: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    this.memory.runs.set(run.id, run); this.memory.idempotency.set(key, run.id); this.memory.events.set(run.id, []); await this.flush(); return { run, created: true };
  }

  async getRun(id, tenantId) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_runs WHERE id=$1 AND tenant_id=$2', [id, tenantId]); return result.rows[0] || null; }
    const run = this.memory.runs.get(id); return run && run.tenant_id === tenantId ? run : null;
  }

  async listRuns(tenantId, limit = 50) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2', [tenantId, limit]); return result.rows; }
    return [...this.memory.runs.values()].filter(run => run.tenant_id === tenantId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  }

  async transitionRun(id, tenantId, nextState, patch = {}) {
    await this.ready;
    if (!RUN_STATES.includes(nextState)) throw new Error('invalid_run_state');
    const current = await this.getRun(id, tenantId);
    if (!current) throw new Error('run_not_found');
    if (!TRANSITIONS[current.state]?.includes(nextState) && current.state !== nextState) throw new Error(`invalid_run_transition:${current.state}->${nextState}`);
    const now = new Date().toISOString();
    const finished = TERMINAL_STATES.has(nextState);
    if (this.pool) {
      const result = await this.pool.query(`UPDATE atom_runs SET state=$3, result=COALESCE($4,result), cancel_requested=COALESCE($5,cancel_requested), updated_at=NOW(), started_at=CASE WHEN $3='running' AND started_at IS NULL THEN NOW() ELSE started_at END, finished_at=CASE WHEN $3 IN ('passed','failed','cancelled','timed_out') THEN NOW() ELSE finished_at END WHERE id=$1 AND tenant_id=$2 RETURNING *`, [id, tenantId, nextState, patch.result ? JSON.stringify(patch.result) : null, patch.cancelRequested ?? null]);
      return result.rows[0];
    }
    const run = { ...current, ...patch, state: nextState, updated_at: now };
    if (nextState === 'running' && !run.started_at) run.started_at = now;
    if (finished) run.finished_at = now;
    this.memory.runs.set(id, run); await this.flush(); return run;
  }

  async requestCancel(id, tenantId) {
    await this.ready;
    const run = await this.getRun(id, tenantId); if (!run) return null;
    if (TERMINAL_STATES.has(run.state)) return run;
    return this.transitionRun(id, tenantId, 'cancelled', { cancelRequested: true });
  }

  async appendEvent(runId, tenantId, type, payload) {
    await this.ready;
    if (this.pool) {
      const result = await this.pool.query('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM atom_run_events WHERE run_id=$1', [runId]);
      const sequence = Number(result.rows[0].sequence);
      const inserted = await this.pool.query('INSERT INTO atom_run_events (run_id,sequence,tenant_id,type,payload) VALUES ($1,$2,$3,$4,$5) RETURNING *', [runId, sequence, tenantId, type, payload]);
      return inserted.rows[0];
    }
    const events = this.memory.events.get(runId) || []; const event = { run_id: runId, sequence: events.length + 1, tenant_id: tenantId, type, payload, created_at: new Date().toISOString() }; events.push(event); this.memory.events.set(runId, events); await this.flush(); return event;
  }

  async listEvents(runId, tenantId, after = 0, limit = 500) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_run_events WHERE run_id=$1 AND tenant_id=$2 AND sequence>$3 ORDER BY sequence ASC LIMIT $4', [runId, tenantId, after, limit]); return result.rows; }
    return (this.memory.events.get(runId) || []).filter(event => event.tenant_id === tenantId && event.sequence > after).slice(0, limit);
  }

  async recordAudit(input) {
    await this.ready; const event = { id: uuidv4(), ...input, created_at: new Date().toISOString() };
    if (this.pool) { await this.pool.query('INSERT INTO atom_audit_events (id,tenant_id,actor_id,action,resource_type,resource_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.id, event.tenantId, event.actorId, event.action, event.resourceType, event.resourceId || null, event.metadata || {}]); }
    else { this.memory.audit.push(event); await this.flush(); }
    return event;
  }

  async listAudit(tenantId, limit = 100) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_audit_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2', [tenantId, limit]); return result.rows; }
    return this.memory.audit.filter(event => event.tenantId === tenantId).slice(-limit).reverse();
  }

  async createArtifact(input) {
    await this.ready; const artifact = { id: input.id || uuidv4(), ...input, created_at: new Date().toISOString() };
    if (this.pool) { const result = await this.pool.query('INSERT INTO atom_artifacts (id,tenant_id,run_id,object_key,content_type,size_bytes,retention_until) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [artifact.id, artifact.tenantId, artifact.runId, artifact.objectKey, artifact.contentType, artifact.sizeBytes || 0, artifact.retentionUntil || null]); return result.rows[0]; }
    this.memory.artifacts.set(artifact.id, artifact); await this.flush(); return artifact;
  }

  async getArtifact(id, tenantId) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_artifacts WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL', [id, tenantId]); return result.rows[0] || null; }
    const artifact = this.memory.artifacts.get(id); return artifact && artifact.tenantId === tenantId && !artifact.deleted_at ? artifact : null;
  }

  async listExpiredArtifacts(limit = 100) {
    await this.ready;
    if (this.pool) { const result = await this.pool.query('SELECT * FROM atom_artifacts WHERE deleted_at IS NULL AND retention_until IS NOT NULL AND retention_until <= NOW() ORDER BY retention_until ASC LIMIT $1', [limit]); return result.rows; }
    return [...this.memory.artifacts.values()].filter(artifact => !artifact.deleted_at && artifact.retentionUntil && new Date(artifact.retentionUntil) <= new Date()).slice(0, limit);
  }

  async markArtifactDeleted(id) {
    await this.ready;
    if (this.pool) { await this.pool.query('UPDATE atom_artifacts SET deleted_at=NOW() WHERE id=$1', [id]); return; }
    const artifact = this.memory.artifacts.get(id); if (artifact) { artifact.deleted_at = new Date().toISOString(); this.memory.artifacts.set(id, artifact); await this.flush(); }
  }

  async recordQuota(tenantId, seconds = 0) {
    await this.ready; const date = new Date().toISOString().slice(0, 10);
    if (this.pool) { const result = await this.pool.query(`INSERT INTO atom_quota_usage (tenant_id,quota_date,runs,execution_seconds) VALUES ($1,$2,1,$3) ON CONFLICT (tenant_id,quota_date) DO UPDATE SET runs=atom_quota_usage.runs+1, execution_seconds=atom_quota_usage.execution_seconds+$3 RETURNING *`, [tenantId, date, Math.max(0, Math.round(seconds))]); return result.rows[0]; }
    const key = `${tenantId}:${date}`; const current = this.memory.quotas.get(key) || { tenantId, date, runs: 0, executionSeconds: 0 }; current.runs += 1; current.executionSeconds += Math.max(0, Math.round(seconds)); this.memory.quotas.set(key, current); await this.flush(); return current;
  }

  async getDashboard(tenantId) {
    const runs = await this.listRuns(tenantId, 500);
    const counts = runs.reduce((acc, run) => { acc[run.state] = (acc[run.state] || 0) + 1; return acc; }, {});
    const terminal = runs.filter(run => TERMINAL_STATES.has(run.state));
    return { totalRuns: runs.length, states: counts, successRate: terminal.length ? Math.round((terminal.filter(run => run.state === 'passed').length / terminal.length) * 100) : 0, averageDurationMs: terminal.length ? Math.round(terminal.reduce((sum, run) => sum + (run.result?.duration || 0), 0) / terminal.length) : 0, recentRuns: runs.slice(0, 10) };
  }
}

module.exports = { Persistence, RUN_STATES, TERMINAL_STATES, TRANSITIONS };
