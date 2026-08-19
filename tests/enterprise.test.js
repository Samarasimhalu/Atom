const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Persistence } = require('../src/backend/persistence');
const RunQueue = require('../src/backend/runQueue');
const RunService = require('../src/backend/runService');
const { hasPermission } = require('../src/backend/security');

function config(storagePath) {
  return {
    persistence: { databaseUrl: '', poolMax: 2 },
    storage: { results: storagePath },
    queue: { name: 'test-runs', redisUrl: '', concurrency: 1, attempts: 1 },
    quotas: { maxRunsPerTenant: 10, retentionDays: 30 }
  };
}

test('run service is idempotent and persists replayable lifecycle events', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-enterprise-'));
  const store = new Persistence(config(directory), { info() {}, warn() {}, error() {} });
  const queue = new RunQueue(config(directory), { info() {}, warn() {}, error() {} });
  const streaming = { sendToChannel() {} };
  const executor = { executeTest: async () => ({ status: 'passed', duration: 12 }) };
  const service = new RunService({ store, queue, executor, streaming, objectStorage: {}, config: config(directory), logger: { info() {}, warn() {}, error() {} } });
  const input = { tenantId: 'tenant-1', userId: 'user-1', testData: { id: 'test-1', code: 'safe' }, sessionId: 'session-1', idempotencyKey: 'key-1' };
  const first = await service.submit(input);
  const second = await service.submit(input);
  assert.equal(second.replayed, true);
  assert.equal(first.run.id, second.run.id);
  let events = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
    events = await service.replay(first.run.id, 'tenant-1');
    if (events.length >= 3) break;
  }
  assert.ok(events.length >= 3);
  assert.ok(events.some(event => event.type === 'run.queued'));
  await queue.close(); await store.close(); await fs.rm(directory, { recursive: true, force: true });
});

test('RBAC separates viewer, developer, and admin capabilities', () => {
  assert.equal(hasPermission(['viewer'], 'runs:read'), true);
  assert.equal(hasPermission(['viewer'], 'runs:create'), false);
  assert.equal(hasPermission(['developer'], 'runs:create'), true);
  assert.equal(hasPermission(['admin'], 'audit:read'), true);
});
