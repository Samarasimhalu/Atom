const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Persistence } = require('../src/backend/persistence');

async function store() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-integrity-'));
  const instance = new Persistence({ environment: 'test', persistence: { mode: 'local', databaseUrl: '' }, storage: { results: directory } }, { info() {}, warn() {}, error() {} });
  await instance.ready;
  return { instance, directory };
}

test('invalid run transitions are rejected and event sequences remain monotonic', async () => {
  const { instance, directory } = await store();
  const created = await instance.createRun({ tenantId: 'tenant-a', userId: 'user-a', idempotencyKey: 'key-a', sessionId: 'session-a', testData: { code: 'test' } });
  await assert.rejects(() => instance.transitionRun(created.run.id, 'tenant-a', 'passed'));
  await instance.appendEvent(created.run.id, 'tenant-a', 'run.requested', {});
  await instance.appendEvent(created.run.id, 'tenant-a', 'run.validated', {});
  const events = await instance.listEvents(created.run.id, 'tenant-a');
  assert.deepEqual(events.map(event => event.sequence), [1, 2]);
  assert.equal(await instance.getRun(created.run.id, 'tenant-b'), null);
  await fs.rm(directory, { recursive: true, force: true });
});

test('duplicate tenant idempotency keys return one durable run', async () => {
  const { instance, directory } = await store();
  const input = { tenantId: 'tenant-a', userId: 'user-a', idempotencyKey: 'same', sessionId: 'session-a', testData: { code: 'test' } };
  const first = await instance.createRun(input);
  const second = await instance.createRun(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.run.id, first.run.id);
  await fs.rm(directory, { recursive: true, force: true });
});
