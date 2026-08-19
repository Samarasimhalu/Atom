const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ApprovalWorkflow {
  constructor(config, store, logger = console) {
    this.config = config; this.store = store; this.logger = logger; this.filePath = path.join(config.storage.results, 'approvals.json'); this.approvals = new Map(); this.ready = this.load();
  }

  async load() {
    await fs.ensureDir(path.dirname(this.filePath));
    if (await fs.pathExists(this.filePath)) {
      try { for (const approval of await fs.readJson(this.filePath)) this.approvals.set(approval.id, approval); } catch (error) { this.logger.warn('approval.load_failed', { error: error.message }); }
    }
  }

  async save() { await fs.writeJson(this.filePath, [...this.approvals.values()], { spaces: 2 }); }

  async request({ tenantId, runId, requesterId, policy, expiresInHours = 24 }) {
    await this.ready;
    const approval = { id: uuidv4(), tenantId, runId, requesterId, status: 'pending', policy, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + expiresInHours * 3600000).toISOString() };
    this.approvals.set(approval.id, approval); await this.save();
    await this.store.recordAudit({ tenantId, actorId: requesterId, action: 'approval.requested', resourceType: 'run', resourceId: runId, metadata: { approvalId: approval.id, policy } });
    return approval;
  }

  async decide(id, tenantId, actorId, decision, comment = '') {
    await this.ready;
    const approval = this.approvals.get(id);
    if (!approval || approval.tenantId !== tenantId) return null;
    if (approval.status !== 'pending') throw new Error('approval_not_pending');
    if (new Date(approval.expiresAt) < new Date()) { approval.status = 'expired'; await this.save(); throw new Error('approval_expired'); }
    if (!['approved', 'rejected'].includes(decision)) throw new Error('approval_decision_invalid');
    approval.status = decision; approval.decidedBy = actorId; approval.comment = comment; approval.decidedAt = new Date().toISOString(); await this.save();
    await this.store.recordAudit({ tenantId, actorId, action: `approval.${decision}`, resourceType: 'run', resourceId: approval.runId, metadata: { approvalId: id, comment } });
    return approval;
  }

  async get(id, tenantId) { await this.ready; const approval = this.approvals.get(id); return approval && approval.tenantId === tenantId ? approval : null; }
  async list(tenantId) { await this.ready; return [...this.approvals.values()].filter(approval => approval.tenantId === tenantId); }
}

module.exports = ApprovalWorkflow;
