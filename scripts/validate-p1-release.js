#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const findings = [];
const requiredFiles = [
  'docs/compliance/P1_RELEASE_CONTROL_STATUS.md',
  'docs/compliance/SECURITY_EXCEPTION.md',
  'docs/compliance/VENDOR_REGISTER_TEMPLATE.yml',
  'docs/compliance/DATA_INVENTORY_TEMPLATE.md',
  'docs/security/remote-egress-release-gate.md'
];

function source(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }
function requireFile(relativePath, control) { if (!fs.existsSync(path.join(root, relativePath))) findings.push({ control, file: relativePath, status: 'missing' }); }
function requireSource(relativePath, pattern, control) { if (!pattern.test(source(relativePath))) findings.push({ control, file: relativePath, status: 'missing' }); }

requiredFiles.forEach(file => requireFile(file, 'P1 governance artifact is version-controlled'));
requireSource('src/backend/testSpecification.js', /SPECIFICATION_VERSION/, 'P1-04 structured specifications are versioned');
requireSource('src/backend/testSpecification.js', /schema_version_unsupported/, 'P1-04 unsupported specification versions fail closed');
requireSource('scripts/generate-access-review.js', /exceptionExpiry/, 'P1-06 access reviews carry exception expiry evidence');
requireSource('scripts/verify-release.js', /releaseApprover/, 'P1-07 release attestations include an approver');
requireSource('.github/workflows/ci.yml', /security:p1:guard/, 'P1 release guard executes in CI');

const status = findings.length ? 'failed' : 'passed';
console.log(JSON.stringify({ status, controlsChecked: 10, findings }, null, 2));
if (findings.length) process.exitCode = 1;
