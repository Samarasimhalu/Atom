# Atom Security Simulation and SOC 2 CI Validation Report

**Validation date:** 20 August 2026

## Executive summary

The authorized, non-destructive penetration-testing simulation passed against the local Atom backend. It verified authentication enforcement, correlation identifiers, security headers, tenant-scoped access behavior, unsafe-execution denial, schema validation, and artifact path-traversal handling. The simulation performed no destructive actions, did not execute browser tests, and did not access external customer systems.

The pull-request SOC 2 regression workflow is present at `.github/workflows/pr-soc2-security.yml`. Its application-security job runs backend syntax checks, regression tests, AI governance evaluation, the penetration simulation, frontend lint/build, dependency audits, secret scanning, dependency review, and SBOM generation. Its worker-image job builds the hardened Playwright worker with provenance and SBOM metadata and runs Trivy and Dockle gates.

## Penetration-testing evidence

| Simulation | Expected control | Observed result |
|---|---|---|
| Unauthenticated `GET /api/tests` | Reject unauthenticated access | `401`; passed |
| Correlation ID check | Return request trace identifier | `x-correlation-id` present; passed |
| Health/security-header check | Emit hardened response headers | `200`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`; passed |
| Tenant-scoped run lookup | Avoid cross-tenant data disclosure | Unknown tenant-scoped run returned `404`, not `500`; passed |
| Unsafe execution payload | Deny shell/process execution | `403 unsafe_execution_denied`; passed |
| Invalid execution payload | Enforce request schema | `400`; passed |
| Encoded artifact traversal | Prevent local file traversal and process failure | `400 invalid_artifact_key`; passed |

The traversal test previously exposed an unhandled `invalid_object_key` exception in the local artifact route. The route was corrected to catch malformed keys and return a bounded client error while keeping the process available. This is the only finding discovered by this simulation, and it is remediated in `src/backend/server.js`.

## Regression and build evidence

| Check | Result |
|---|---:|
| `npm run security:pentest:smoke` | Passed |
| `npm test` | Passed, 15/15 tests |
| `npm run lint:backend` | Passed |
| Frontend `pnpm install --frozen-lockfile` | Passed |
| Frontend `pnpm run lint` | Passed with six existing non-blocking Fast Refresh warnings |
| Frontend `pnpm run build` | Passed with Vite 8.2.1 |
| Frontend `pnpm audit --audit-level high` | Passed; no known vulnerabilities |
| Root `npm audit --audit-level high --package-lock-only` | No high/critical findings; one moderate `uuid` finding remains and requires a breaking upgrade |
| Workflow YAML and required file checks | Passed |
| `git diff --check` | Passed |

## Pull-request pipeline controls

The workflow triggers for pull requests targeting `main` and supports manual dispatch. It uses concurrency cancellation and read-only repository contents permission, with security-events permission available for security tooling. The pipeline fails closed on failed tests, high-severity dependency findings, leaked secrets, failed worker-image scans, and failed evidence aggregation.

The workflow creates an SBOM artifact named `atom-soc2-sbom-${{ github.sha }}` and uses dependency review for pull requests. The image job uses the checked-in `workers/playwright/Dockerfile`, enables build provenance and SBOM metadata, fails on unfixed HIGH or CRITICAL Trivy findings, and fails on Dockle fatal findings.

## Limitations and follow-up findings

The local environment does not provide an accessible Docker daemon, so the worker image could not be built and scanned locally. The worker-image portion of the GitHub Actions workflow is the authoritative execution path for Trivy, Dockle, image SBOM, and provenance checks.

The root dependency audit has been reduced from critical/high findings to one moderate `uuid` advisory. Automated remediation requires a breaking upgrade to `uuid@14`; compatibility testing should be completed before applying that change. Frontend lint has six warnings related to Fast Refresh component exports; they do not currently fail the command but should be cleaned up as a maintainability task.

The simulation is an application-layer smoke assessment, not a substitute for an independent penetration test, authenticated multi-tenant test campaign, production infrastructure assessment, or formal SOC 2 Type II examination. Before production launch, execute the image scan in CI, complete backup restoration evidence in the target environment, perform access reviews, and retain immutable CI and audit evidence according to the rollout guide.

## Delivered artifacts

| Artifact | Purpose |
|---|---|
| `.github/workflows/pr-soc2-security.yml` | Pull-request SOC 2 regression and security pipeline |
| `scripts/security-pentest-smoke.js` | Authorized non-destructive penetration-testing simulation |
| `src/backend/server.js` | Traversal exception handling remediation |
| `package.json`, `package-lock.json` | Root dependency remediation and security script |
| `src/frontend/package.json`, `src/frontend/pnpm-lock.yaml` | Frontend toolchain and vulnerability remediation |
