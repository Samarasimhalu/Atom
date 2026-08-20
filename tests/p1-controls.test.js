const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateTestSpecification, SPECIFICATION_VERSION } = require('../src/backend/testSpecification');

function validSpecification(overrides = {}) {
  return {
    name: 'P1 schema control', purpose: 'versioned specification validation', type: 'ui',
    target: { url: 'https://shop.example', environment: 'development' }, browser: 'chromium',
    tags: ['smoke'], steps: ['open page'], assertions: ['page visible'], timeoutMs: 3000,
    ...overrides
  };
}

test('structured test specifications default to the supported schema version and fail closed for unknown versions', () => {
  const current = validateTestSpecification(validSpecification());
  assert.equal(current.valid, true);
  assert.equal(current.spec.schemaVersion, SPECIFICATION_VERSION);
  const unsupported = validateTestSpecification(validSpecification({ schemaVersion: '9.9' }));
  assert.equal(unsupported.valid, false);
  assert.ok(unsupported.errors.includes('schema_version_unsupported'));
});

test('access-review evidence rejects unbounded exceptions and produces a private integrity-hashed report', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atom-access-review-'));
  const input = path.join(directory, 'input.json');
  const output = path.join(directory, 'report.json');
  fs.writeFileSync(input, JSON.stringify({
    period: '2026-Q3', reviewer: 'security-reviewer', records: [
      { userId: 'admin-1', tenantId: 'tenant-a', roles: ['admin'], privileged: true, decision: 'exception', exceptionExpiry: '2026-12-31T00:00:00Z', ticket: 'SEC-100' }
    ]
  }));
  const result = spawnSync(process.execPath, ['scripts/generate-access-review.js', input, output], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.version, 2);
  assert.ok(report.sha256);
  assert.equal(fs.statSync(output).mode & 0o077, 0);

  const expired = path.join(directory, 'expired.json');
  fs.writeFileSync(expired, JSON.stringify({ period: '2026-Q3', reviewer: 'security-reviewer', records: [{ userId: 'admin-1', tenantId: 'tenant-a', decision: 'exception', exceptionExpiry: '2020-01-01T00:00:00Z' }] }));
  const denied = spawnSync(process.execPath, ['scripts/generate-access-review.js', expired, path.join(directory, 'expired-report.json')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /access_review_exception_expiry_required/);
  fs.rmSync(directory, { recursive: true, force: true });
});
