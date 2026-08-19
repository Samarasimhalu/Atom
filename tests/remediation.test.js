const test = require('node:test');
const assert = require('node:assert/strict');
const { mapGroupsToRoles } = require('../src/backend/identityProvider');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('OIDC group mapping produces only configured least-privilege roles', () => {
  const claims = mapGroupsToRoles({ groups: ['atom-developers', 'unknown-group'] }, { groupClaim: 'groups', roleMappingJson: JSON.stringify({ 'atom-developers': 'developer' }) });
  assert.deepEqual(claims.roles, ['developer']);
});

test('release verifier rejects mutable worker tags and accepts immutable digests', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atom-release-'));
  const file = path.join(directory, 'release.json');
  fs.writeFileSync(file, JSON.stringify({ commitSha: 'abc', apiImageDigest: 'registry/api@sha256:' + 'a'.repeat(64), workerImageDigest: 'registry/worker:latest', sbomDigest: 'sha256:x', migrationVersion: '1', configurationChecksum: 'x', policyVersion: '1', modelAllowlist: ['gpt-4'], releaseApprover: 'security' }));
  assert.throws(() => execFileSync(process.execPath, ['scripts/verify-release.js', file], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' }));
  fs.writeFileSync(file, JSON.stringify({ commitSha: 'abc', apiImageDigest: 'registry/api@sha256:' + 'a'.repeat(64), workerImageDigest: 'registry/worker@sha256:' + 'b'.repeat(64), sbomDigest: 'sha256:x', migrationVersion: '1', configurationChecksum: 'x', policyVersion: '1', modelAllowlist: ['gpt-4'], releaseApprover: 'security' }));
  const output = execFileSync(process.execPath, ['scripts/verify-release.js', file], { cwd: path.resolve(__dirname, '..') }).toString();
  assert.match(output, /"status":"valid"/);
});
