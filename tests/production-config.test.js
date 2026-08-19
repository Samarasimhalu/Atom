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
    execution: { workerImage: 'registry.example.org/atom-worker@sha256:' + 'a'.repeat(64), enabled: true },
    webhooks: { signingSecret: 'secret' },
    ...overrides
  };
}

test('production configuration fails closed for insecure defaults', () => {
  const errors = validateProductionConfig(productionConfig({ auth: { mode: 'development', jwtSecret: '', allowedOrigins: ['http://localhost:5173'], oidc: {} }, persistence: { mode: 'local' }, queue: { mode: 'local' }, objectStorage: { mode: 'local' }, execution: { workerImage: 'atom-worker:latest', enabled: false }, webhooks: { signingSecret: '' } }));
  assert.ok(errors.includes('production_auth_mode_must_be_oidc_or_saml'));
  assert.ok(errors.includes('postgres_persistence_required'));
  assert.ok(errors.includes('durable_queue_required'));
  assert.ok(errors.includes('private_object_storage_required'));
  assert.ok(errors.includes('immutable_worker_digest_required'));
  assert.ok(errors.includes('execution_must_be_explicitly_enabled'));
});

test('complete production configuration passes validation', () => {
  assert.deepEqual(validateProductionConfig(productionConfig()), []);
});
