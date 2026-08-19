const fs = require('node:fs/promises');
const path = require('node:path');

class DataLifecycleService {
  constructor({ store, objectStorage, config, logger = console }) {
    this.store = store;
    this.objectStorage = objectStorage;
    this.config = config;
    this.logger = logger;
  }

  async exportTenant(tenantId, actorId) {
    const runs = await this.store.listRuns(tenantId, 5000);
    const events = [];
    for (const run of runs) events.push(...await this.store.listEvents(run.id, tenantId, 0, 10000));
    const audit = await this.store.listAudit(tenantId, 5000);
    const artifacts = await Promise.all((await this.store.listTenantArtifacts(tenantId)).map(async artifact => ({ ...artifact, downloadUrl: await this.objectStorage.getSignedDownloadUrl(artifact.object_key || artifact.objectKey) })));
    const exportRecord = { version: 1, tenantId, exportedAt: new Date().toISOString(), runs, events, audit, artifacts };
    await this.store.recordAudit({ tenantId, actorId, action: 'tenant.data_exported', resourceType: 'tenant', resourceId: tenantId, metadata: { runCount: runs.length, eventCount: events.length, artifactCount: artifacts.length } });
    return exportRecord;
  }

  async deleteTenant(tenantId, actorId, reason) {
    const artifacts = await this.store.listTenantArtifacts(tenantId);
    for (const artifact of artifacts) {
      await this.objectStorage.deleteObject(artifact.object_key || artifact.objectKey);
      await this.store.markArtifactDeleted(artifact.id);
    }
    const deleted = await this.store.deleteTenantData(tenantId);
    await this.store.recordAudit({ tenantId, actorId, action: 'tenant.data_deleted', resourceType: 'tenant', resourceId: tenantId, metadata: { reason, artifactCount: artifacts.length, ...deleted } });
    return { tenantId, deletedAt: new Date().toISOString(), artifactCount: artifacts.length, ...deleted };
  }
}

module.exports = DataLifecycleService;
