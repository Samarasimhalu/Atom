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

test('streaming service permits only the authenticated tenant channel and ignores client-selected connection IDs', () => {
  const messages = [];
  const ws = { readyState: 1, on() {}, send: value => messages.push(JSON.parse(value)) };
  const service = new StreamingService(null);
  service.addConnection(ws, 'connection-a', { tenantId: 'tenant-a', userId: 'user-a', roles: ['developer'] });
  assert.equal(service.subscribe('connection-a', 'tenant-tenant-a'), true);
  assert.equal(service.subscribe('connection-a', 'tenant-tenant-b'), false);
  ws.connectionId = 'connection-a';
  service.handleMessage(ws, { type: 'subscribe', payload: { channel: 'tenant-tenant-b' }, connectionId: 'connection-attacker' });
  assert.equal(messages.at(-1).message, 'subscription_not_authorized');
  service.sendToChannel('tenant-tenant-b', { type: 'secret' });
  assert.equal(messages.some(message => message.type === 'secret'), false);
});

test('signed webhooks reject tampering and stale timestamps', () => {
  const signed = signPayload({ event: 'run.passed' }, 'secret', Math.floor(Date.now() / 1000));
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp), true);
  assert.equal(verifyPayload(`${signed.body}x`, signed.signature, 'secret', signed.timestamp), false);
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp - 1000), false);
});
