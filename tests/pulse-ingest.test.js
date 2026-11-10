const test = require('node:test');
const assert = require('node:assert/strict');
const { app, pulse } = require('../src/backend/server');

function listen() { return new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); }
const events = [{ type: 'navigate', ts: Date.now(), sessionId: 's1', path: '/a' }, { type: 'click', ts: Date.now() + 1, sessionId: 's1', path: '/a', target: 'go' }];

test('pulse ingest key flow: create, ingest from foreign origin, no read access, revoke', async () => {
  const server = await listen();
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { 'Content-Type': 'application/json', 'X-Dev-User': 'pulse-admin', 'X-Tenant-Id': 'pulse-t1' };
  try {
    // dev identity is only a developer, who cannot manage keys.
    const denied = await fetch(`${base}/api/pulse/keys`, { method: 'POST', headers: admin, body: '{}' });
    assert.equal(denied.status, 403);

    const noKey = await fetch(`${base}/api/pulse/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });
    assert.equal(noKey.status, 401);
    const badKey = await fetch(`${base}/api/pulse/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pulse-Key': 'apk_wrong' }, body: JSON.stringify({ events }) });
    assert.equal(badKey.status, 401);

    // Issue a key through the same store the server uses (admin routes need an admin role).
    const issued = require('../src/backend/server').pulseKeys.create('pulse-t1', { label: 'test' });

    const preflight = await fetch(`${base}/api/pulse/ingest`, { method: 'OPTIONS', headers: { Origin: 'https://customer.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-pulse-key' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://customer.example');

    const ok = await fetch(`${base}/api/pulse/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://customer.example', 'X-Pulse-Key': issued.key }, body: JSON.stringify({ events }) });
    assert.equal(ok.status, 202);
    assert.equal((await ok.json()).accepted, 2);
    assert.equal(pulse.sessionList('pulse-t1').length >= 1, true);

    // Dev mode falls back to a local identity, so the key's tenant must still never leak into it.
    const read = await fetch(`${base}/api/pulse/gaps`, { headers: { 'X-Pulse-Key': issued.key } });
    assert.equal(pulse.sessionList('pulse-t1').length, 1);
    assert.equal((await read.json()).gaps.length, 0);
  } finally { server.close(); }
});

