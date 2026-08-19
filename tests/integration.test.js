const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
process.env.AUTH_MODE = 'strict';
process.env.JWT_SECRET = 'integration-secret';
process.env.EXECUTION_ENABLED = 'false';
const { app } = require('../src/backend/server');

function testToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: 'smoke-user', tenant_id: 'smoke-tenant', roles: ['developer'], exp: Math.floor(Date.now() / 1000) + 60 });
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const authHeaders = { authorization: `Bearer ${testToken()}` };

function request(server, path, options = {}, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const address = server.address();
    const req = http.request({
      hostname: address.address,
      port: address.port,
      path,
      method: options.method || 'GET',
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(options.headers || {})
      }
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('API smoke test enforces security and validation boundaries', async t => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(() => server.close());

  const health = await request(server, '/api/health');
  assert.equal(health.status, 200);
  assert.ok(health.headers['x-correlation-id']);
  assert.equal(health.headers['x-content-type-options'], 'nosniff');

  const unauthorized = await request(server, '/api/tests');
  assert.equal(unauthorized.status, 401);

  const invalid = await request(server, '/api/generate/test', {
    method: 'POST',
    headers: authHeaders
  }, { prompt: 'x', testType: 'ui' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'validation_error');

  const denied = await request(server, '/api/execute/test', {
    method: 'POST',
    headers: authHeaders
  }, {
    sessionId: 'session-12345678',
    testData: { code: "import { test } from '@playwright/test';\ntest('safe', async () => { await Promise.resolve(); });" }
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'unsafe_execution_denied');
});
