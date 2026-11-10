const test = require('node:test');
const assert = require('node:assert/strict');
const { PulseService, templatePath, sanitizeEvent } = require('../src/backend/pulse');

function journey(pulse, tenant, id, { fail = false } = {}) {
  const t = Date.now();
  const events = [
    { type: 'navigate', ts: t, sessionId: id, path: '/cart' },
    { type: 'click', ts: t + 1, sessionId: id, path: '/cart', target: 'checkout-btn' },
    { type: 'navigate', ts: t + 2, sessionId: id, path: `/checkout/${1000 + Math.random() * 9000 | 0}` },
    { type: 'submit', ts: t + 3, sessionId: id, path: '/checkout/42', target: 'pay' }
  ];
  if (fail) events.push({ type: 'error', ts: t + 4, sessionId: id, path: '/checkout/42', message: 'boom for a@b.com' });
  return pulse.ingest(tenant, events);
}

test('templatePath collapses ids', () => {
  assert.equal(templatePath('/orders/123/items/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab'), '/orders/:id/items/:id');
});

test('sanitizeEvent redacts PII and rejects bad events', () => {
  const e = sanitizeEvent({ type: 'error', ts: 1, sessionId: 's', path: '/x', message: 'user a@b.com password=hunter2' });
  assert.ok(!e.message.includes('a@b.com') && !e.message.includes('hunter2'));
  assert.equal(sanitizeEvent({ type: 'bogus', ts: 1, sessionId: 's' }), null);
  assert.equal(sanitizeEvent({ type: 'input', ts: 1, sessionId: 's', path: '/', target: 'password' }).target, '[SENSITIVE_FIELD]');
});

test('mines journeys, finds gaps, and respects tenant isolation', () => {
  const pulse = new PulseService();
  for (let i = 0; i < 5; i++) journey(pulse, 'a', `s${i}`, { fail: i === 0 });
  assert.equal(pulse.journeys('b').length, 0);
  const { gaps, realUserCoveragePercent } = pulse.gaps('a', []);
  assert.equal(realUserCoveragePercent, 0);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].sessions, 5);
  assert.ok(gaps[0].touchesMoney);
  assert.match(gaps[0].suggestedPrompt, /regression test/);
});

test('existing tests close the gap', () => {
  const pulse = new PulseService();
  for (let i = 0; i < 3; i++) journey(pulse, 'a', `s${i}`);
  const specs = [{ target: { url: 'https://x.test/cart' }, steps: ['open /checkout/ page'] }];
  const { gaps, realUserCoveragePercent } = pulse.gaps('a', specs);
  assert.equal(gaps.length, 0);
  assert.equal(realUserCoveragePercent, 100);
});

test('rejects oversized batches', () => {
  assert.throws(() => new PulseService().ingest('a', new Array(501).fill({})), /batch_too_large/);
});

test('persists sessions to disk and reloads them', () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-')), 'p.json');
  const a = new PulseService({ filePath });
  for (let i = 0; i < 3; i++) journey(a, 't', `p${i}`);
  a.save();
  const b = new PulseService({ filePath });
  assert.equal(b.journeys('t').length, 1);
}); 

test('PulseKeyStore issues hashed, tenant-bound, revocable keys', () => {
  const { PulseKeyStore } = require('../src/backend/pulse');
  const keys = new PulseKeyStore();
  const created = keys.create('a', { label: 'site' });
  assert.match(created.key, /^apk_/);
  assert.equal(keys.verify(created.key).tenantId, 'a');
  assert.equal(keys.verify('apk_nope'), null);
  assert.equal(JSON.stringify([...keys.byHash.values()]).includes(created.key), false);
  assert.deepEqual(keys.list('b'), []);
  assert.equal(keys.revoke('b', created.id), false);
  assert.equal(keys.revoke('a', created.id), true);
  assert.equal(keys.verify(created.key), null);
});
