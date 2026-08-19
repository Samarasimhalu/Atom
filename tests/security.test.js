const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  verifyHs256Jwt,
  denyUnsafeExecution
} = require('../src/backend/security');
const {
  validateGenerationRequest,
  validateExecutionRequest
} = require('../src/backend/validation');

function makeJwt(payload, secret) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test('verifies a valid tenant-scoped JWT and rejects tampering', () => {
  const secret = 'test-secret';
  const token = makeJwt({ sub: 'user-1', tenant_id: 'tenant-1', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal(verifyHs256Jwt(token, secret).tenant_id, 'tenant-1');
  assert.equal(verifyHs256Jwt(`${token}x`, secret), null);
});

test('validates generation and execution schemas', () => {
  const generation = validateGenerationRequest({ prompt: 'Test login', testType: 'ui', options: { browser: 'chromium' } });
  assert.equal(generation.testType, 'ui');
  assert.throws(() => validateGenerationRequest({ prompt: 'x', testType: 'unsupported' }));
  const execution = validateExecutionRequest({ sessionId: 'session-12345678', testData: { code: 'import { test } from \'@playwright/test\';\ntest(\'x\', async () => {});' } });
  assert.equal(execution.sessionId, 'session-12345678');
});

test('denies execution unless a hardened worker image is enabled', () => {
  let response;
  const req = { body: { testData: { code: 'safe test code that is long enough' } }, correlationId: 'corr-1' };
  const res = { status: code => { response = code; return { json: body => body }; } };
  denyUnsafeExecution({ execution: { enabled: false, workerImage: '' } })(req, res, () => { throw new Error('should not continue'); });
  assert.equal(response, 403);
});
