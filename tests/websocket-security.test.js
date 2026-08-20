const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const WebSocket = require('ws');

process.env.AUTH_MODE = 'strict';
process.env.JWT_SECRET = 'websocket-integration-secret';
process.env.EXECUTION_ENABLED = 'false';
process.env.ENABLE_WEBSOCKETS = 'true';
process.env.ALLOWED_ORIGINS = 'http://allowed.example';

const { server, wss, streamingService } = require('../src/backend/server');

function token(tenantId = 'tenant-a', userId = 'socket-user') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: userId, tenant_id: tenantId, roles: ['developer'], exp: Math.floor(Date.now() / 1000) + 60 });
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForMessage(messages, predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = messages.find(predicate);
    if (match) return match;
    await delay(10);
  }
  throw new Error('expected_websocket_message_not_received');
}

function openSocket(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const ws = new WebSocket(url, { headers });
    ws.on('message', data => messages.push(JSON.parse(String(data))));
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

test('WebSocket upgrades reject URL tokens and disallowed origins, while authenticated sockets cannot subscribe to arbitrary or cross-tenant run channels', async t => {
  const listener = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
  const port = listener.address().port;
  t.after(async () => {
    for (const client of wss.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  });

  const querySocket = new WebSocket(`ws://127.0.0.1:${port}/?access_token=${token()}`);
  const queryClose = await new Promise(resolve => querySocket.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
  assert.equal(queryClose.code, 1008);
  assert.equal(queryClose.reason, 'query_string_credentials_prohibited');

  const foreignOriginSocket = new WebSocket(`ws://127.0.0.1:${port}/`, { headers: { origin: 'https://attacker.example', authorization: `Bearer ${token()}` } });
  const foreignOriginClose = await new Promise(resolve => foreignOriginSocket.once('close', (code, reason) => resolve({ code, reason: String(reason) })));
  assert.equal(foreignOriginClose.code, 1008);
  assert.equal(foreignOriginClose.reason, 'origin_not_allowed');

  const { ws, messages } = await openSocket(`ws://127.0.0.1:${port}/`, { origin: 'http://allowed.example', authorization: `Bearer ${token('tenant-a')}` });
  await waitForMessage(messages, message => message.type === 'connection-established');
  streamingService.sendToChannel('tenant-tenant-b', { type: 'tenant-b-secret' });
  await delay(25);
  assert.equal(messages.some(message => message.type === 'tenant-b-secret'), false);

  ws.send(JSON.stringify({ type: 'subscribe', payload: { channel: 'tenant-tenant-b' }, connectionId: 'attacker-selected-id' }));
  const arbitraryChannelResult = await waitForMessage(messages, message => message.type === 'error' && message.message === 'unsupported_message_type');
  assert.equal(arbitraryChannelResult.message, 'unsupported_message_type');

  ws.send(JSON.stringify({ type: 'subscribe-run', payload: { runId: 'run-other-b' }, connectionId: 'attacker-selected-id' }));
  const crossTenantResult = await waitForMessage(messages, message => message.type === 'error' && message.message === 'subscription_not_authorized');
  assert.equal(crossTenantResult.message, 'subscription_not_authorized');
  streamingService.sendToChannel('run-run-other-b', { type: 'run-secret' });
  await delay(25);
  assert.equal(messages.some(message => message.type === 'run-secret'), false);
  ws.close();
});
