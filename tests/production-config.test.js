const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig } = require('../src/backend/security');

function productionConfig(overrides = {}) {
  return {
    environment: 'production',
    auth: { mode: 'oidc', jwtSecret: 'long-managed-secret', allowedOrigins: ['https://atom.example.org'], oidc: { issuer: 'https://idp.example.org', audience: 'atom-api', jwksUri: 'https://idp.example.org/.well-known/jwks.json' } },
    persistence: { mode: 'postgres', databaseUrl: 'postgres://db/atom' },
    queue: { mode: 'bullmq', redisUrl: 'rediss://redis/atom' },
    objectStorage: { mode: 's3', endpoint: 'https://s3.example.org', bucket: 'atom', accessKeyId: 'access', secretAccessKey: 'secret' },
    execution: { workerImage: 'registry.example.org/atom-worker@sha256:' + 'a'.repeat(64), enabled: true, networkMode: 'none', egressProxyUrl: '' },
    webhooks: { signingSecret: 'secret' },
    ...overrides
  };
}

test('production configuration fails closed for insecure defaults', () => {
  const errors = validateProductionConfig(productionConfig({ auth: { mode: 'development', jwtSecret: '', allowedOrigins: ['http://localhost:5173'], oidc: {} }, persistence: { mode: 'local' }, queue: { mode: 'local' }, objectStorage: { mode: 'local' }, execution: { workerImage: 'atom-worker:latest', enabled: false }, webhooks: { signingSecret: '' } }));
  assert.ok(errors.includes('production_auth_mode_must_be_oidc'));
  assert.ok(errors.includes('postgres_persistence_required'));
  assert.ok(errors.includes('durable_queue_required'));
  assert.ok(errors.includes('private_object_storage_required'));
  assert.ok(!errors.includes('immutable_worker_digest_required'), 'disabled execution is a safe deployment mode');
});

test('complete production configuration passes validation', () => {
  assert.deepEqual(validateProductionConfig(productionConfig()), []);
});

test('production configuration rejects legacy test API activation', () => {
  const errors = validateProductionConfig(productionConfig({ features: { legacyTestApi: true } }));
  assert.ok(errors.includes('legacy_test_api_not_supported_in_production'));
});
