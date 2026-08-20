#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const findings = [];

function requireSource(relativePath, pattern, control) {
  if (!pattern.test(read(relativePath))) findings.push({ control, file: relativePath, status: 'missing' });
}

function safeTemplate() {
  return `# Atom release-safe baseline. Replace OIDC and infrastructure placeholders before deployment.\nNODE_ENV=production\nAUTH_MODE=oidc\nOIDC_ISSUER=https://identity.example.com/\nOIDC_AUDIENCE=atom-api\nOIDC_JWKS_URI=https://identity.example.com/.well-known/jwks.json\nOIDC_ROLE_MAPPING_JSON={\"atom-developers\":\"developer\",\"atom-approvers\":\"approver\",\"atom-admins\":\"admin\"}\nALLOWED_ORIGINS=https://app.example.com\nPERSISTENCE_MODE=postgres\nQUEUE_MODE=bullmq\nOBJECT_STORAGE_MODE=s3\n# Keep execution disabled until the managed egress proxy and registered target allowlist are deployed.\nEXECUTION_ENABLED=false\nWORKER_NETWORK_MODE=none\nENABLE_LEGACY_TEST_API=false\nENABLE_WEBSOCKETS=false\nPOLICY_ALLOWED_DOMAINS=\n`;
}

const writeIndex = process.argv.indexOf('--write-template');
if (writeIndex !== -1) {
  const destination = process.argv[writeIndex + 1];
  if (!destination) throw new Error('usage: node scripts/remediate-p0-release.js --write-template <path>');
  const resolved = path.resolve(destination);
  if (fs.existsSync(resolved)) throw new Error(`refusing_to_overwrite_existing_file:${resolved}`);
  fs.writeFileSync(resolved, safeTemplate(), { mode: 0o600 });
  console.log(JSON.stringify({ status: 'template_written', path: resolved }, null, 2));
}

requireSource('src/backend/server.js', /requireLegacyTestApi/, 'P0-1 legacy API is disabled by default');
requireSource('src/backend/server.js', /approvalWorkflow\.consume\(/, 'P0-3 approval consumption is bound at execution');
requireSource('src/backend/server.js', /query_string_credentials_prohibited/, 'P0-2 WebSocket query tokens are explicitly rejected');
requireSource('src/backend/streamingService.js', /subscribeRun\(connectionId, runId\)/, 'P0-2 run subscriptions are server-authorized');
requireSource('src/backend/streamingService.js', /resolveRun\(runId, connection\.tenantId\)/, 'P0-2 run subscriptions use tenant-scoped lookup');
requireSource('src/backend/runService.js', /run-\$\{run\.id\}/, 'P0-2 run events are not published to predictable session channels');
requireSource('src/backend/approvalWorkflow.js', /policyVersion/, 'P0-3 approvals bind a policy version');
requireSource('src/backend/approvalWorkflow.js', /approval\.consume_denied/, 'P0-3 denied and replayed approval attempts are audited');
requireSource('src/backend/approvalWorkflow.js', /requestDigest/, 'P0-3 approvals bind a canonical request digest');
requireSource('src/backend/persistence.js', /status='consumed'/, 'P0-3 approvals are atomically marked single use');
requireSource('src/backend/policyEngine.js', /target_private_address_blocked/, 'P0-6 private targets are denied');
requireSource('src/backend/policyEngine.js', /target_domain_not_allowlisted/, 'P0-6 allowlist policy is enforced');
requireSource('src/backend/mcpExecutor.js', /runResultsDir/, 'P0-4 worker results mount is per run');
requireSource('src/backend/mcpExecutor.js', /maxArtifactFiles/, 'P0-4 worker artifact file limits are enforced');
requireSource('src/backend/mcpExecutor.js', /maxArtifactBytes/, 'P0-4 worker artifact byte limits are enforced');
requireSource('src/backend/security.js', /production_auth_mode_must_be_oidc/, 'P0-5 unsupported production authentication is denied');
requireSource('src/backend/security.js', /managed_egress_not_configured/, 'P0-4 execution fails closed without managed egress');
requireSource('src/backend/security.js', /api_execution_requires_managed_egress/, 'P0-4 chained API execution fails closed without managed egress');
requireSource('src/backend/apiTestPlan.js', /api_chain_forward_reference/, 'P0-4 chained API values require a preceding successful extraction');
requireSource('src/backend/apiTestPlan.js', /api_json_path_forbidden_property/, 'P0-4 chained API extraction rejects unsafe properties');

const status = findings.length ? 'failed' : 'passed';
console.log(JSON.stringify({ status, controlsChecked: 20, findings }, null, 2));
if (findings.length) process.exitCode = 1;
