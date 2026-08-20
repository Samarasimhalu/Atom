const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { validateTestSpecification } = require('../src/backend/testSpecification');
const PolicyEngine = require('../src/backend/policyEngine');
const ApprovalWorkflow = require('../src/backend/approvalWorkflow');
const StreamingService = require('../src/backend/streamingService');
const { Persistence } = require('../src/backend/persistence');
const { signPayload, verifyPayload } = require('../src/backend/signedWebhook');

function config(storagePath) {
  return {
    storage: { results: storagePath },
    policy: { requireApprovalForTags: ['payment'], allowedDomains: ['shop.example'], blockedDomains: ['169.254.169.254'], maxTimeoutMs: 300000 },
    webhooks: { signingSecret: 'secret', timeoutMs: 1000 }
  };
}

function specification() {
  const result = validateTestSpecification({
    name: 'payment', purpose: 'checkout', type: 'ui', target: { url: 'https://shop.example/checkout', environment: 'production' },
    tags: ['payment'], steps: ['click'], assertions: ['visible'], timeoutMs: 5000
  });
  assert.equal(result.valid, true);
  return result.spec;
}

test('structured specification and policy engine reject unsafe targets and require approval', () => {
  const policy = new PolicyEngine(config('/tmp')).evaluate(specification());
  assert.equal(policy.allowed, true);
  assert.equal(policy.approvalRequired, true);
  const engine = new PolicyEngine(config('/tmp'));
  assert.equal(engine.evaluate({ ...specification(), target: { url: 'http://169.254.169.254' } }).allowed, false);
  const privateTarget = engine.evaluate({ ...specification(), target: { url: 'http://127.0.0.1' } });
  assert.ok(privateTarget.reasons.includes('target_private_address_blocked'));
  const offAllowlist = engine.evaluate({ ...specification(), target: { url: 'https://attacker.example' } });
  assert.deepEqual(offAllowlist.reasons, ['target_domain_not_allowlisted']);
});

test('approval workflow binds an approver decision to one requester, specification, session, and idempotency key', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-approval-'));
  const runtimeConfig = { ...config(directory), environment: 'development', persistence: { mode: 'local', databaseUrl: '', poolMax: 1, statementTimeoutMs: 1000 } };
  const store = new Persistence(runtimeConfig, { info() {}, warn() {} });
  const workflow = new ApprovalWorkflow(runtimeConfig, store, { warn() {} });
  const spec = specification();
  const request = { tenantId: 'tenant', requesterId: 'requester', specification: spec, sessionId: 'session-12345678', idempotencyKey: 'idem-1', policy: { approvalRequired: true } };
  const approval = await workflow.request(request);
  await assert.rejects(() => workflow.decide(approval.id, 'tenant', 'requester', 'approved'), /approval_self_decision_denied/);
  const decided = await workflow.decide(approval.id, 'tenant', 'approver', 'approved', 'reviewed');
  assert.equal(decided.status, 'approved');
  await assert.rejects(() => workflow.consume(approval.id, { ...request, requesterId: 'attacker' }), /approval_requester_mismatch/);
  const consumed = await workflow.consume(approval.id, request);
  assert.equal(consumed.status, 'consumed');
  await assert.rejects(() => workflow.consume(approval.id, request), /approval_not_approved/);
  assert.equal((await store.listAudit('tenant')).length, 3);
  await store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test('streaming service allows tenant notifications automatically but authorizes each run subscription through a tenant-scoped lookup', async () => {
  const messages = [];
  const ws = { readyState: 1, on() {}, send: value => messages.push(JSON.parse(value)) };
  const runs = new Map([
    ['run-owned-a', { id: 'run-owned-a', tenant_id: 'tenant-a' }],
    ['run-other-b', { id: 'run-other-b', tenant_id: 'tenant-b' }]
  ]);
  const service = new StreamingService(null, {
    maxMessagesPerMinute: 10,
    resolveRun: async (runId, tenantId) => {
      const run = runs.get(runId);
      return run?.tenant_id === tenantId ? run : null;
    }
  });
  service.addConnection(ws, 'connection-a', { tenantId: 'tenant-a', userId: 'user-a', roles: ['developer'] });
  ws.connectionId = 'connection-a';
  assert.equal(service.subscribeTenant('connection-a'), true);
  service.sendToChannel('tenant-tenant-b', { type: 'secret' });
  assert.equal(messages.some(message => message.type === 'secret'), false);

  await service.handleMessage(ws, { type: 'subscribe', payload: { channel: 'tenant-tenant-b' }, connectionId: 'connection-attacker' });
  assert.equal(messages.at(-1).message, 'unsupported_message_type');
  await service.handleMessage(ws, { type: 'subscribe-run', payload: { runId: 'run-other-b' }, connectionId: 'connection-attacker' });
  assert.equal(messages.at(-1).message, 'subscription_not_authorized');
  service.sendToChannel('run-run-other-b', { type: 'secret' });
  assert.equal(messages.some(message => message.type === 'secret'), false);

  await service.handleMessage(ws, { type: 'subscribe-run', payload: { runId: 'run-owned-a' } });
  assert.equal(messages.at(-1).type, 'subscribe-run-confirmed');
  service.sendToChannel('run-run-owned-a', { type: 'run.passed' });
  assert.equal(messages.at(-1).type, 'run.passed');
});

test('streaming service denies run subscriptions without runs:read and throttles abusive messages per connection', async () => {
  const messages = [];
  const ws = { readyState: 1, on() {}, send: value => messages.push(JSON.parse(value)) };
  const service = new StreamingService(null, { maxMessagesPerMinute: 2, resolveRun: async () => ({ id: 'run-owned-a' }) });
  service.addConnection(ws, 'viewer-connection', { tenantId: 'tenant-a', userId: 'unprivileged', roles: [] });
  ws.connectionId = 'viewer-connection';
  await service.handleMessage(ws, { type: 'subscribe-run', payload: { runId: 'run-owned-a' } });
  assert.equal(messages.at(-1).message, 'permission_denied');
  await service.handleMessage(ws, { type: 'ping' });
  await service.handleMessage(ws, { type: 'ping' });
  assert.equal(messages.at(-1).message, 'rate_limit_exceeded');
});

test('signed webhooks reject tampering and stale timestamps', () => {
  const signed = signPayload({ event: 'run.passed' }, 'secret', Math.floor(Date.now() / 1000));
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp), true);
  assert.equal(verifyPayload(`${signed.body}x`, signed.signature, 'secret', signed.timestamp), false);
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp - 1000), false);
});
