const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const RunService = require('../src/backend/runService');
const StreamingService = require('../src/backend/streamingService');

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.messages = [];
  }

  send(message) {
    this.messages.push(JSON.parse(message));
  }
}

test('run state transitions publish a sanitized dashboard invalidation to the originating tenant channel', async () => {
  const calls = [];
  const streaming = {
    runChannel: runId => `run-${runId}`,
    tenantChannel: tenantId => `tenant-${tenantId}`,
    sendToChannel: (channel, message) => calls.push({ channel, message })
  };
  const service = new RunService({
    store: { appendEvent: async () => ({ sequence: 17, created_at: '2026-08-20T00:00:00.000Z', payload: { ignored: false } }) },
    queue: { registerHandler() {} },
    executor: {},
    streaming,
    objectStorage: {},
    config: {},
    logger: {}
  });
  const run = { id: 'run-12345678', tenant_id: 'tenant-a', session_id: 'session-private' };

  await service.emit(run, 'run.failed', {
    result: { logs: 'sensitive executor output', secret: 'never-send' },
    artifact: { object_key: 'private/evidence.zip' }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].channel, 'run-run-12345678');
  assert.equal(calls[1].channel, 'tenant-tenant-a');
  assert.deepEqual(calls[1].message, {
    type: 'dashboard.run-state-changed',
    runId: 'run-12345678',
    state: 'failed',
    sequence: 17,
    occurredAt: '2026-08-20T00:00:00.000Z'
  });
  assert.equal(Object.hasOwn(calls[1].message, 'result'), false);
  assert.equal(Object.hasOwn(calls[1].message, 'artifact'), false);
  assert.equal(Object.hasOwn(calls[1].message, 'sessionId'), false);
});

test('connections without dashboard:read cannot receive tenant dashboard invalidation events', () => {
  const streaming = new StreamingService({});
  const deniedSocket = new MockSocket();
  const authorizedSocket = new MockSocket();

  streaming.addConnection(deniedSocket, 'denied-connection', { tenantId: 'tenant-a', userId: 'run-only-user', roles: [] });
  streaming.addConnection(authorizedSocket, 'authorized-connection', { tenantId: 'tenant-a', userId: 'dashboard-user', roles: ['developer'] });

  assert.equal(streaming.subscribeTenant('denied-connection'), false);
  assert.equal(streaming.subscribeTenant('authorized-connection'), true);

  streaming.sendToChannel(streaming.tenantChannel('tenant-a'), {
    type: 'dashboard.run-state-changed',
    runId: 'run-12345678',
    state: 'running',
    sequence: 4,
    occurredAt: '2026-08-20T00:00:00.000Z'
  });

  assert.equal(deniedSocket.messages.length, 0);
  assert.equal(authorizedSocket.messages.length, 1);
  assert.equal(authorizedSocket.messages[0].type, 'dashboard.run-state-changed');
});

const { WebSocketTicketStore } = require('../src/backend/websocketTickets');

test('WebSocket authentication tickets are opaque, origin-bound, and single-use', () => {
  let now = 1_000;
  const tickets = new WebSocketTicketStore({ ttlSeconds: 30, now: () => now });
  const issued = tickets.issue({ tenantId: 'tenant-a', userId: 'user-a', roles: ['developer'], origin: 'https://console.example' });

  assert.match(issued.ticket, /^[A-Za-z0-9_-]{32,256}$/);
  assert.deepEqual(tickets.consume(issued.ticket, { origin: 'https://console.example' }), {
    sub: 'user-a', tenant_id: 'tenant-a', roles: ['developer']
  });
  assert.equal(tickets.consume(issued.ticket, { origin: 'https://console.example' }), null);

  const wrongOrigin = tickets.issue({ tenantId: 'tenant-a', userId: 'user-a', roles: ['developer'], origin: 'https://console.example' });
  assert.equal(tickets.consume(wrongOrigin.ticket, { origin: 'https://attacker.example' }), null);
  assert.equal(tickets.consume(wrongOrigin.ticket, { origin: 'https://console.example' }), null);

  const expired = tickets.issue({ tenantId: 'tenant-a', userId: 'user-a', roles: ['developer'] });
  now += 31_000;
  assert.equal(tickets.consume(expired.ticket), null);
});
