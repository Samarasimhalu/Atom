const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { validateTestSpecification } = require('../src/backend/testSpecification');
const PolicyEngine = require('../src/backend/policyEngine');
const ApprovalWorkflow = require('../src/backend/approvalWorkflow');
const { signPayload, verifyPayload } = require('../src/backend/signedWebhook');

function config(storagePath) {
  return { storage: { results: storagePath }, policy: { requireApprovalForTags: ['payment'], blockedDomains: ['169.254.169.254'], maxTimeoutMs: 300000 }, webhooks: { signingSecret: 'secret', timeoutMs: 1000 } };
}

test('structured specification and policy engine reject unsafe targets and require approval', () => {
  const result = validateTestSpecification({ name: 'payment', purpose: 'checkout', type: 'ui', target: { url: 'https://shop.example', environment: 'production' }, tags: ['payment'], steps: ['click'], assertions: ['visible'], timeoutMs: 5000 });
  assert.equal(result.valid, true);
  const policy = new PolicyEngine(config('/tmp')).evaluate(result.spec);
  assert.equal(policy.allowed, true);
  assert.equal(policy.approvalRequired, true);
  const blocked = new PolicyEngine(config('/tmp')).evaluate({ ...result.spec, target: { url: 'http://169.254.169.254' } });
  assert.equal(blocked.allowed, false);
});

test('approval workflow records a tenant-scoped decision', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-approval-'));
  const events = [];
  const store = { recordAudit: async event => events.push(event) };
  const workflow = new ApprovalWorkflow(config(directory), store, { warn() {} });
  const approval = await workflow.request({ tenantId: 'tenant', runId: 'run', requesterId: 'user', policy: { approvalRequired: true } });
  const decided = await workflow.decide(approval.id, 'tenant', 'admin', 'approved', 'reviewed');
  assert.equal(decided.status, 'approved');
  assert.equal(events.length, 2);
  await fs.rm(directory, { recursive: true, force: true });
});

test('signed webhooks reject tampering and stale timestamps', () => {
  const signed = signPayload({ event: 'run.passed' }, 'secret', Math.floor(Date.now() / 1000));
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp), true);
  assert.equal(verifyPayload(`${signed.body}x`, signed.signature, 'secret', signed.timestamp), false);
  assert.equal(verifyPayload(signed.body, signed.signature, 'secret', signed.timestamp - 1000), false);
});
