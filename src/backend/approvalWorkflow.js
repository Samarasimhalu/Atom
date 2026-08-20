const crypto = require('node:crypto');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((output, key) => ({ ...output, [key]: canonicalize(value[key]) }), {});
  return value;
}

function executionDigest({ specification, sessionId, idempotencyKey }) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize({ specification, sessionId, idempotencyKey }))).digest('hex');
}

class ApprovalWorkflow {
  constructor(config, store, logger = console) {
    this.config = config;
    this.store = store;
    this.logger = logger;
    this.durable = ['createApproval', 'getApproval', 'listApprovals', 'decideApproval', 'consumeApproval'].every(method => typeof store?.[method] === 'function');
    this.filePath = path.join(config.storage.results, 'approvals.json');
    this.approvals = new Map();
    this.mutation = Promise.resolve();
    this.ready = this.durable ? Promise.resolve(store.ready) : this.load();
  }

  async load() {
    await fs.ensureDir(path.dirname(this.filePath));
    if (await fs.pathExists(this.filePath)) {
      try { for (const approval of await fs.readJson(this.filePath)) this.approvals.set(approval.id, approval); } catch (error) { this.logger.warn('approval.load_failed', { error: error.message }); }
    }
  }

  async save() { if (!this.durable) await fs.writeJson(this.filePath, [...this.approvals.values()], { spaces: 2 }); }

  async withMutation(operation) {
    const next = this.mutation.then(operation, operation);
    this.mutation = next.catch(() => undefined);
    return next;
  }

  async audit(input) {
    if (typeof this.store?.recordAudit === 'function') await this.store.recordAudit(input);
  }

  async request({ tenantId, requesterId, specification, sessionId, idempotencyKey, policy, expiresInHours = 24 }) {
    await this.ready;
    const requestDigest = executionDigest({ specification, sessionId, idempotencyKey });
    const input = { id: uuidv4(), tenantId, requesterId, requestDigest, policy, expiresAt: new Date(Date.now() + expiresInHours * 3600000).toISOString() };
    const created = this.durable
      ? await this.store.createApproval(input)
      : await this.withMutation(async () => {
        const approval = { ...input, status: 'pending', createdAt: new Date().toISOString() };
        this.approvals.set(approval.id, approval); await this.save(); return { approval, created: true };
      });
    if (created.created) await this.audit({ tenantId, actorId: requesterId, action: 'approval.requested', resourceType: 'execution_request', resourceId: requestDigest, metadata: { approvalId: created.approval.id, policy } });
    return created.approval;
  }

  async decide(id, tenantId, actorId, decision, comment = '') {
    await this.ready;
    const approval = this.durable
      ? await this.store.decideApproval({ id, tenantId, actorId, decision, comment })
      : await this.withMutation(async () => {
        const current = this.approvals.get(id);
        if (!current || current.tenantId !== tenantId) return null;
        if (current.status !== 'pending') throw new Error('approval_not_pending');
        if (current.requesterId === actorId) throw new Error('approval_self_decision_denied');
        if (new Date(current.expiresAt) < new Date()) { current.status = 'expired'; await this.save(); throw new Error('approval_expired'); }
        if (!['approved', 'rejected'].includes(decision)) throw new Error('approval_decision_invalid');
        current.status = decision; current.decidedBy = actorId; current.comment = comment; current.decidedAt = new Date().toISOString(); await this.save(); return current;
      });
    if (approval) await this.audit({ tenantId, actorId, action: `approval.${decision}`, resourceType: 'execution_request', resourceId: approval.requestDigest, metadata: { approvalId: id, comment } });
    return approval;
  }

  async consume(id, { tenantId, requesterId, specification, sessionId, idempotencyKey }) {
    await this.ready;
    const requestDigest = executionDigest({ specification, sessionId, idempotencyKey });
    const approval = this.durable
      ? await this.store.consumeApproval({ id, tenantId, requesterId, requestDigest })
      : await this.withMutation(async () => {
        const current = this.approvals.get(id);
        if (!current || current.tenantId !== tenantId) return null;
        if (current.status !== 'approved') throw new Error('approval_not_approved');
        if (new Date(current.expiresAt) < new Date()) { current.status = 'expired'; await this.save(); throw new Error('approval_expired'); }
        if (current.requesterId !== requesterId) throw new Error('approval_requester_mismatch');
        if (current.requestDigest !== requestDigest) throw new Error('approval_request_mismatch');
        current.status = 'consumed'; current.consumedAt = new Date().toISOString(); current.consumedBy = requesterId; await this.save(); return current;
      });
    if (approval) await this.audit({ tenantId, actorId: requesterId, action: 'approval.consumed', resourceType: 'execution_request', resourceId: requestDigest, metadata: { approvalId: id } });
    return approval;
  }

  async get(id, tenantId) { await this.ready; return this.durable ? this.store.getApproval(id, tenantId) : (() => { const approval = this.approvals.get(id); return approval?.tenantId === tenantId ? approval : null; })(); }
  async list(tenantId) { await this.ready; return this.durable ? this.store.listApprovals(tenantId) : [...this.approvals.values()].filter(approval => approval.tenantId === tenantId); }
}

module.exports = ApprovalWorkflow;
module.exports.ApprovalWorkflow = ApprovalWorkflow;
module.exports.executionDigest = executionDigest;
module.exports.canonicalize = canonicalize;
