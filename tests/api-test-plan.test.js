const test = require('node:test');
const assert = require('node:assert/strict');
const { validateApiTestPlan, resolvePlaceholders, runApiTestPlan } = require('../src/backend/apiTestPlan');
const { validateTestSpecification } = require('../src/backend/testSpecification');

function chainedPlan() {
  return {
    kind: 'api-test-plan/v1',
    name: 'order lifecycle',
    environment: 'payments-staging',
    contractVersion: 'sha256:contract-v1',
    steps: [
      {
        id: 'create-order',
        request: { method: 'POST', path: '/v1/orders', headers: { 'content-type': 'application/json' }, body: { sku: 'sku-1', quantity: 1 } },
        assertions: [{ type: 'status', equals: 201 }, { type: 'json_path_exists', path: '$.id' }],
        extract: [{ name: 'orderId', path: '$.id', classification: 'secret' }]
      },
      {
        id: 'get-order',
        request: { method: 'GET', path: '/v1/orders/{{chain.orderId}}' },
        assertions: [{ type: 'status', equals: [200, 304] }, { type: 'json_path_equals', path: '$.id', equals: 'order-123' }],
        extract: []
      }
    ]
  };
}

test('declarative API plans extract a response value and inject it into a subsequent request without exposing its value in results', async () => {
  const requests = [];
  const result = await runApiTestPlan(chainedPlan(), {
    request: async payload => {
      requests.push(payload);
      if (payload.path === '/v1/orders') return { status: 201, headers: { 'content-type': 'application/json' }, body: { id: 'order-123' } };
      if (payload.path === '/v1/orders/order-123') return { status: 200, headers: {}, body: { id: 'order-123' } };
      throw new Error('unexpected_request');
    }
  });
  assert.equal(result.status, 'passed');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, '/v1/orders/order-123');
  assert.deepEqual(result.steps[0].extracted, [{ name: 'orderId', present: true, classification: 'secret' }]);
  assert.equal(JSON.stringify(result).includes('order-123'), false);
});

test('API chaining rejects forward references, duplicate variables, unsafe JSON paths, arbitrary URLs, and script-like plan fields', () => {
  const forward = chainedPlan();
  forward.steps[0].request.path = '/v1/orders/{{chain.orderId}}';
  assert.equal(validateApiTestPlan(forward).valid, false);
  assert.match(validateApiTestPlan(forward).errors.join(','), /api_chain_forward_reference/);

  const duplicate = chainedPlan();
  duplicate.steps[1].extract = [{ name: 'orderId', path: '$.id' }];
  assert.equal(validateApiTestPlan(duplicate).valid, false);
  assert.match(validateApiTestPlan(duplicate).errors.join(','), /api_extraction_duplicate/);

  const unsafePath = chainedPlan();
  unsafePath.steps[0].extract[0].path = '$.__proto__.polluted';
  assert.equal(validateApiTestPlan(unsafePath).valid, false);
  assert.match(validateApiTestPlan(unsafePath).errors.join(','), /api_json_path_invalid|api_json_path_forbidden_property/);

  const absoluteUrl = chainedPlan();
  absoluteUrl.steps[0].request.path = 'https://attacker.example/collect';
  assert.equal(validateApiTestPlan(absoluteUrl).valid, false);
  assert.match(validateApiTestPlan(absoluteUrl).errors.join(','), /api_path_invalid/);

  assert.throws(() => resolvePlaceholders('{{chain.missing}}', {}), /api_chain_reference_missing/);
});

test('structured Atom specifications accept only validated declarative API plans in place of raw generated code', () => {
  const valid = validateTestSpecification({
    name: 'order api chain', purpose: 'validate order lifecycle', type: 'api',
    target: { url: 'https://api.example.test', environment: 'staging' }, apiPlan: chainedPlan()
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.spec.apiPlan.steps.length, 2);
  assert.equal(valid.spec.code, '');

  const invalid = validateTestSpecification({
    name: 'invalid api plan', purpose: 'must be rejected', type: 'api',
    target: { url: 'https://api.example.test', environment: 'staging' },
    apiPlan: { ...chainedPlan(), kind: 'api-test-plan/v9' }
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(error => error.includes('api_plan_version_unsupported')));
});

test('API plan evaluation stops after an assertion failure and does not execute a dependent request', async () => {
  const plan = chainedPlan();
  let calls = 0;
  const result = await runApiTestPlan(plan, {
    request: async () => {
      calls += 1;
      return { status: 500, headers: {}, body: { error: 'unavailable' } };
    }
  });
  assert.equal(result.status, 'failed');
  assert.equal(calls, 1);
  assert.equal(result.steps.length, 1);
});
