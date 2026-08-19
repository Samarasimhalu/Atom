const fs = require('node:fs');

const manifestPath = process.argv[2] || process.env.RELEASE_MANIFEST || 'release-manifest.json';
if (!fs.existsSync(manifestPath)) {
  console.error(`release_manifest_missing:${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const required = ['commitSha', 'apiImageDigest', 'workerImageDigest', 'sbomDigest', 'migrationVersion', 'configurationChecksum', 'policyVersion', 'modelAllowlist', 'releaseApprover'];
const missing = required.filter(key => manifest[key] === undefined || manifest[key] === null || manifest[key] === '');
const digestPattern = /^.+@sha256:[a-f0-9]{64}$/;
if (!digestPattern.test(manifest.workerImageDigest || '') || !digestPattern.test(manifest.apiImageDigest || '')) missing.push('immutable_image_digests');
if (!Array.isArray(manifest.modelAllowlist) || manifest.modelAllowlist.length === 0) missing.push('model_allowlist');
if (missing.length) {
  console.error(JSON.stringify({ error: 'release_manifest_invalid', missing }));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'valid', commitSha: manifest.commitSha, workerImageDigest: manifest.workerImageDigest, apiImageDigest: manifest.apiImageDigest }));
