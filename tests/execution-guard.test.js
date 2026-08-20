const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const MCPExecutor = require('../src/backend/mcpExecutor');
const { denyUnsafeExecution } = require('../src/backend/security');

function executionConfig(root, overrides = {}) {
  return {
    mcp: { maxConcurrentTests: 1 },
    storage: {
      results: path.join(root, 'results'),
      screenshots: path.join(root, 'screenshots'),
      videos: path.join(root, 'videos'),
      traces: path.join(root, 'traces')
    },
    execution: { enabled: true, workerImage: 'registry.example/worker@sha256:' + 'a'.repeat(64), networkMode: 'none', egressProxyUrl: '', maxArtifactFiles: 1, maxArtifactBytes: 10, ...overrides.execution },
    policy: { allowedDomains: [], ...overrides.policy }
  };
}

function runMiddleware(middleware, req) {
  return new Promise(resolve => {
    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; resolve({ next: false, statusCode: this.statusCode, body }); } };
    middleware(req, response, () => resolve({ next: true, statusCode: response.statusCode, body: null }));
  });
}

test('artifact processing enforces both configured file and byte quotas', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-artifact-quota-'));
  const resultsDir = path.join(root, 'results', 'session-1');
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(path.join(resultsDir, 'first.png'), '12345678');
  await fs.writeFile(path.join(resultsDir, 'second.png'), 'abcdefgh');
  const executor = new MCPExecutor(executionConfig(root));
  const artifacts = await executor.processArtifacts(resultsDir, 'session-1');
  assert.equal(artifacts.screenshots.length, 1);
  assert.equal(artifacts.collection.copiedFiles, 1);
  assert.equal(artifacts.collection.copiedBytes, 8);
  assert.equal(artifacts.omitted[0].reason, 'artifact_file_limit_exceeded');
  await fs.rm(root, { recursive: true, force: true });
});

test('API plans are denied until a managed egress proxy and target allowlist are configured', async () => {
  const noEgress = denyUnsafeExecution(executionConfig('/tmp'));
  const denied = await runMiddleware(noEgress, { body: { testData: { apiPlan: { kind: 'api-test-plan/v1' } } }, correlationId: 'test' });
  assert.equal(denied.next, false);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.reason, 'api_execution_requires_managed_egress');

  const managed = denyUnsafeExecution(executionConfig('/tmp', { execution: { networkMode: 'managed-egress', egressProxyUrl: 'https://egress.example.test' }, policy: { allowedDomains: ['api.example.test'] } }));
  const allowed = await runMiddleware(managed, { body: { testData: { apiPlan: { kind: 'api-test-plan/v1' } } }, correlationId: 'test' });
  assert.equal(allowed.next, true);
});
