# Atom SOC 2 CI Security Regression Test Summary

**Scope:** Pull-request workflow at `.github/workflows/pr-soc2-security.yml`.

## Purpose

The workflow is designed to prevent security, compliance, and supply-chain regressions from merging into `main`. It runs for every pull request targeting `main` and can also be started manually. Two required jobs—application-security regression and hardened worker-image scanning—must succeed before the final evidence-summary job passes.

## Regression gates

| CI gate | Security or SOC 2 objective | Failure condition | Current local validation status |
|---|---|---|---:|
| Committed lockfile verification | Ensures reproducible dependency resolution and prevents a build from using undeclared dependency state | Root or frontend manifest/lockfile is missing | Passed; root `package-lock.json` and frontend `pnpm-lock.yaml` are present |
| Clean backend dependency install | Uses the committed root lockfile for reproducible backend installation | `npm ci` fails | Passed with `npm ci --dry-run --ignore-scripts` |
| Frozen frontend dependency install | Prevents lockfile drift during frontend installation | `pnpm install --frozen-lockfile` fails | Passed |
| Backend syntax and lint gate | Detects syntax errors across security, tenancy, validation, persistence, policy, identity, and governance modules | `npm run lint:backend` fails | Passed |
| Unit and integration suite | Protects authorization, tenant isolation, state integrity, policy, approval, webhook, JWT, schema, and secure-execution controls | Any of 15 Node tests fail | Passed: 15/15 |
| AI policy/evaluation gate | Confirms structured specifications satisfy policy and the minimum AI quality score | Evaluation score below `0.85`, schema failure, or policy failure | Passed: score 1.00 |
| Non-destructive penetration simulation | Verifies authentication, headers, tenant behavior, unsafe-execution denial, schema validation, and artifact traversal protection | A simulated attack bypasses an expected control | Passed: 6/6 checks |
| Frontend lint | Detects frontend code-quality regressions that may affect secure behavior | ESLint exits non-zero | Passed with six non-blocking Fast Refresh warnings |
| Frontend production build | Detects client build and dependency compatibility regressions | Vite build fails | Passed |
| Root dependency audit | Blocks HIGH and CRITICAL known vulnerabilities in the backend dependency graph | `npm audit` finds HIGH or CRITICAL issues | Passed at configured threshold; one moderate `uuid` advisory remains |
| Frontend dependency audit | Blocks HIGH and CRITICAL known vulnerabilities in frontend dependencies | `pnpm audit` finds HIGH or CRITICAL issues | Passed; no known vulnerabilities |
| Secret scan | Identifies exposed credentials or secrets in the pull-request diff and repository history | Gitleaks finding | Enforced in CI; requires GitHub Actions execution |
| Dependency review | Flags insecure or risky dependency changes introduced by a pull request | Dependency Review action finding | Enforced for pull requests; requires GitHub Actions execution |
| SBOM generation and retention | Produces traceable software-component evidence for the proposed revision | SBOM generation or artifact upload fails | Enforced in CI; SBOM retained for 30 days |
| Backup script syntax gate | Prevents shell syntax defects in backup and object-storage restoration smoke scripts | `bash -n` fails | Enforced in CI |
| Hardened worker build | Rebuilds the isolated Playwright worker from the checked-in Dockerfile with provenance and SBOM metadata | Image build fails | Enforced in CI; local Docker daemon unavailable |
| Trivy image scan | Blocks unfixed HIGH and CRITICAL OS/package vulnerabilities in the worker image | Trivy reports configured-severity findings | Enforced in CI; local Docker daemon unavailable |
| Dockle image hardening scan | Blocks fatal container-hardening configuration defects | Dockle reports a fatal finding | Enforced in CI; local Docker daemon unavailable |
| Evidence-summary gate | Fails the workflow unless both application-security and worker-image jobs pass | Either required job is unsuccessful | Enforced in CI |

## Penetration simulation coverage

The authorized simulation invokes a local backend instance with execution explicitly disabled. It sends only synthetic requests and does not interact with external applications, browsers, production data, or customer systems.

| Simulated attack or control probe | Expected outcome | Observed outcome |
|---|---|---|
| Unauthenticated API access | `401` response | Passed |
| Correlation identifier presence | Response includes `x-correlation-id` | Passed |
| Secure HTTP response headers | `nosniff` and `DENY` headers | Passed |
| Tenant-scoped run lookup | No tenant data leak or unhandled server failure | Passed: `404` |
| Unsafe Playwright payload | Explicit execution denial | Passed: `403 unsafe_execution_denied` |
| Malformed execution request | Schema rejection | Passed: `400` |
| Encoded artifact path traversal | Reject malformed path without reading local files | Passed: `400 invalid_artifact_key` |

## Operational interpretation

The application-level security regression gates have been validated locally. The image build, Trivy, Dockle, Gitleaks, dependency review, SBOM upload, and final multi-job aggregation require GitHub Actions because the local environment has no accessible Docker daemon and does not emulate GitHub-hosted action integrations.

The workflow is intentionally fail-closed: a failing test, audit, secret finding, dependency review finding, worker image vulnerability finding, or unsuccessful required job prevents the final evidence-summary job from succeeding. The root audit contains one moderate `uuid` advisory whose remediation requires a breaking major-version upgrade; it is outside the workflow’s HIGH/CRITICAL blocking threshold and should remain a tracked dependency-upgrade item.
