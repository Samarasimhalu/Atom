# Atom

**Atom** is an AI-assisted Playwright testing platform designed for controlled test generation, approval-gated execution, and tenant-aware artifact handling. It combines a React interface with an Express API, a governed AI gateway, and an isolated Playwright worker image.

> **Security posture:** Atom treats generated test code as untrusted input. Test execution is disabled by default and is permitted only when a prebuilt isolated worker image is configured explicitly.

## Contents

- [What Atom provides](#what-atom-provides)
- [Architecture and security controls](#architecture-and-security-controls)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Command-line reference](#command-line-reference)
- [Chat prompts and slash-command note](#chat-prompts-and-slash-command-note)
- [API CLI examples](#api-cli-examples)
- [Running isolated Playwright workers](#running-isolated-playwright-workers)
- [Configuration](#configuration)
- [CI/CD security gates](#cicd-security-gates)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## What Atom provides

Atom turns a structured natural-language request into a Playwright test specification and, when explicitly enabled, submits the test to an isolated worker for execution. The platform is appropriate for UI, API, visual, and mixed test definitions.

| Capability | Description |
|---|---|
| **AI test generation** | Generates and normalizes Playwright test specifications through an allowlisted AI gateway with input redaction, budgets, evaluation, and audit events. |
| **Controlled execution** | Runs are disabled unless `EXECUTION_ENABLED=true` and an isolated immutable worker image is configured. Unsafe code patterns are denied before submission. |
| **Tenant isolation** | Every authenticated request has a tenant context. Runs, audit events, approvals, quotas, and artifacts are queried within that tenant boundary. |
| **Identity and RBAC** | Supports development identity headers, HS256 JWTs, and an OIDC/SAML foundation. Built-in roles include `viewer`, `developer`, `approver`, `admin`, and `owner`. |
| **Durable operations** | Supports PostgreSQL persistence, Redis/BullMQ queues, S3-compatible artifact storage, idempotency keys, run cancellation, and replayable run events. |
| **Governance** | Applies a policy engine, approval workflow, signed-webhook support, retention controls, access-review evidence, and an AI evaluation harness. |
| **Assurance** | Includes SOC 2 readiness materials, release verification, SBOM/provenance controls, dependency checks, secret scanning, image scanning, and a non-destructive security smoke simulation. |

## Architecture and security controls

```text
Browser / API client
        |
        v
React frontend  ----->  Express API
                            |
             +--------------+----------------+
             |              |                |
             v              v                v
       Identity + RBAC  AI gateway       Policy + approvals
             |              |                |
             +--------------+----------------+
                            |
                            v
                   Run state machine
                            |
              +-------------+--------------+
              |                            |
              v                            v
       PostgreSQL / local store       Redis/BullMQ / local queue
              |
              v
  Authorization-aware artifact storage (S3 / local)
                            |
                            v
      Immutable, non-root Playwright worker image
```

The worker is intentionally separate from the API process. It uses a digest-pinned Playwright Noble base image, installs a dedicated locked Playwright runtime at image-build time, and invokes the preinstalled `playwright` executable. It does **not** install customer-controlled dependencies at test runtime. The worker image is continuously checked by the CI vulnerability gate. See the official [Playwright Docker guidance](https://playwright.dev/docs/docker) for the upstream runtime model.

## Prerequisites

| Tool | Recommended version | Purpose |
|---|---:|---|
| Node.js | 20 LTS or 22 LTS | Backend tooling and root project dependencies. |
| npm | Bundled with Node.js | Root dependency management. |
| pnpm | Current stable via Corepack | Frontend dependency management; the frontend uses `pnpm-lock.yaml`. |
| Docker with Buildx | Current stable | Required only to build or run isolated Playwright workers and local infrastructure. |
| PostgreSQL, Redis, S3-compatible storage | Production only | Required for the durable production profile. Docker Compose can provide local services. |

## Quick start

### 1. Clone and install dependencies

```bash
git clone https://github.com/itismohan/Atom.git
cd Atom

# Root/backend dependencies use npm's committed package-lock.json.
npm ci

# Frontend dependencies use pnpm's committed pnpm-lock.yaml.
corepack enable
pnpm --dir src/frontend install --frozen-lockfile
```

> Do not use `npm ci` inside `src/frontend`; that package intentionally uses `pnpm-lock.yaml` and has no `package-lock.json`.

### 2. Start a safe development profile

The default development profile uses local persistence, queueing, and artifact storage. Execution remains disabled unless you explicitly configure a worker image.

```bash
export NODE_ENV=development
export AUTH_MODE=development
export ALLOWED_ORIGINS=http://localhost:5173
export PORT=3001

# Optional: enables provider-backed generation; Atom can use its fallback when absent.
export OPENAI_API_KEY='replace-with-a-development-key'

npm run dev
```

Open the following local endpoints:

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| API health | `http://localhost:3001/api/health` |
| API readiness | `http://localhost:3001/api/readyz` |

### 3. Verify the backend

```bash
curl -sS http://localhost:3001/api/health | jq
curl -sS http://localhost:3001/api/readyz | jq
```

`/api/health` and `/api/readyz` are public operational endpoints. Other `/api/*` endpoints require identity and a tenant context.

## Command-line reference

Run these commands from the repository root.

| Command | Purpose |
|---|---|
| `npm run dev` | Starts backend and frontend together. |
| `npm run dev:backend` | Starts the Express backend on `PORT` or `3001`. |
| `npm run dev:frontend` | Starts the Vite frontend. |
| `npm run build` | Builds the frontend production bundle. |
| `npm start` | Alias for `npm run dev`; this is not a production process manager command. |
| `npm run lint:backend` | Parses all hardened backend modules and security scripts. |
| `npm test` | Runs the Node unit and integration regression tests. |
| `npm run security:pentest:smoke` | Runs the authorized, non-destructive API security simulation. |
| `npm run evaluate:ai` | Runs the AI-generation evaluation harness. |
| `npm run verify:release` | Checks production configuration and release requirements. |
| `npm run evidence:access-review` | Generates access-review evidence. |
| `npm run backup:restore:smoke` | Runs the backup/restore smoke procedure. |
| `npm run infra:up` | Starts local PostgreSQL, Redis, and MinIO services using `infra/docker-compose.yml`. |
| `npm run infra:down` | Stops the local infrastructure services. |
| `npm run db:migrate` | Applies `infra/migrations/001_enterprise_foundation.sql` using `DATABASE_URL`. |

### Frontend commands

```bash
# Reproducible frontend install
pnpm --dir src/frontend install --frozen-lockfile

# Static checks and build
pnpm --dir src/frontend lint
pnpm --dir src/frontend build

# Vulnerability audit; CI fails only for HIGH and CRITICAL findings.
pnpm --dir src/frontend audit --audit-level high
```

### Recommended local validation sequence

```bash
npm run lint:backend
npm test
npm run security:pentest:smoke
npm run evaluate:ai
npm run build
pnpm --dir src/frontend audit --audit-level high
```

## Chat prompts and slash-command note

Atom’s web interface accepts natural-language test requests. The repository does **not** ship a separate shell-style slash-command interpreter such as `/run` or `/deploy`; do not assume slash-prefixed text invokes privileged behavior.

Use clear prompts in the UI, for example:

```text
Generate a Chromium UI test for the sign-in page. Submit an invalid password and verify the accessible error message.

Create an API test for POST /v1/orders that validates a 422 response when quantity is omitted.

Create a visual test for the checkout page at 1280x720 and retain a screenshot only on failure.
```

For repeatable automation, prefer the API CLI examples below. They make identity, tenant ownership, correlation IDs, idempotency, and execution intent explicit.

## API CLI examples

The following commands use development identity mode. Start Atom with `AUTH_MODE=development`, then set reusable shell variables:

```bash
export ATOM_API=http://localhost:3001
export ATOM_TENANT=acme-dev
export ATOM_USER=developer@example.test
export ATOM_CORRELATION_ID="local-$(date +%s)"
```

### Common authenticated headers

```bash
ATOM_HEADERS=(
  -H 'Content-Type: application/json'
  -H "X-Tenant-Id: ${ATOM_TENANT}"
  -H "X-Dev-User: ${ATOM_USER}"
  -H "X-Correlation-Id: ${ATOM_CORRELATION_ID}"
)
```

In strict or OIDC mode, replace the development headers with an authorization header from your identity provider:

```bash
export ATOM_TOKEN='eyJ...'
AUTH_HEADER=(-H "Authorization: Bearer ${ATOM_TOKEN}")
```

### Generate a test

```bash
curl -sS -X POST "${ATOM_API}/api/generate/test" \
  "${ATOM_HEADERS[@]}" \
  --data '{
    "prompt": "Test invalid sign-in credentials and verify the error message.",
    "testType": "ui",
    "options": {
      "browser": "chromium",
      "timeout": 30000,
      "screenshot": "only-on-failure",
      "trace": "retain-on-failure"
    }
  }' | jq
```

The generation request accepts `ui`, `api`, `visual`, or `mixed` for `testType`. Browser values are `chromium`, `firefox`, and `webkit`. Request validation restricts timeouts, viewport sizes, retry counts, workers, and artifact modes.

### Submit an execution

Execution requires a `developer`, `approver`, `admin`, or `owner` role; a tenant; an idempotency key; and an explicitly enabled isolated worker image.

```bash
export SESSION_ID="run_$(date +%s)"
export IDEMPOTENCY_KEY="${ATOM_TENANT}-${SESSION_ID}"

curl -sS -X POST "${ATOM_API}/api/execute/test" \
  "${ATOM_HEADERS[@]}" \
  -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  -H 'X-Project-Id: website-smoke' \
  --data "{
    \"sessionId\": \"${SESSION_ID}\",
    \"testData\": {
      \"id\": \"homepage-smoke\",
      \"testType\": \"ui\",
      \"code\": \"import { test, expect } from '@playwright/test';\\n\\ntest('homepage returns a title', async ({ page }) => {\\n  await page.goto('https://example.com');\\n  await expect(page).toHaveTitle(/Example/);\\n});\",
      \"mcpConfig\": {
        \"browser\": \"chromium\",
        \"timeout\": 30000,
        \"screenshot\": \"only-on-failure\",
        \"trace\": \"retain-on-failure\"
      }
    }
  }" | jq
```

Atom rejects execution when it is disabled, no worker image is configured, policy rules deny the target, an approval is required but missing, the request is malformed, or the test contains prohibited patterns such as `child_process`, `eval`, `process.env`, or filesystem access.

### Inspect, replay, or cancel a run

```bash
# List tenant-visible runs
curl -sS "${ATOM_API}/api/runs?limit=20" "${ATOM_HEADERS[@]}" | jq

# Read one run and event history
curl -sS "${ATOM_API}/api/runs/${SESSION_ID}" "${ATOM_HEADERS[@]}" | jq
curl -sS "${ATOM_API}/api/runs/${SESSION_ID}/events?after=0" "${ATOM_HEADERS[@]}" | jq

# Request cancellation
curl -sS -X POST "${ATOM_API}/api/runs/${SESSION_ID}/cancel" "${ATOM_HEADERS[@]}" | jq
```

### Manage approvals

Production, payment, destructive, or policy-tagged runs may require an approval. An `approver`, `admin`, or `owner` can request and decide on approvals.

```bash
# List approvals visible to the tenant
curl -sS "${ATOM_API}/api/approvals" "${ATOM_HEADERS[@]}" | jq

# Decide an approval (replace APPROVAL_ID)
curl -sS -X POST "${ATOM_API}/api/approvals/${APPROVAL_ID}/decision" \
  "${ATOM_HEADERS[@]}" \
  --data '{"decision":"approved","comment":"Approved for controlled QA execution."}' | jq
```

### Administrative endpoints

| Endpoint | Required permission | Purpose |
|---|---|---|
| `GET /api/dashboard` | `dashboard:read` | Tenant dashboard summary. |
| `GET /api/audit` | `audit:read` | Tenant audit events. |
| `GET /api/admin/runtime-attestation` | `admin:runtime` | Runtime configuration attestation. |
| `POST /api/evaluations/run` | `admin:ai` | AI generation evaluation. |
| `POST /api/webhooks/verify` | `admin:ai` | Verifies a signed webhook payload. |
| `POST /api/admin/data/export` | `admin:privacy` | Starts a tenant data-export workflow. |
| `POST /api/admin/data/delete` | `admin:privacy` | Starts a tenant data-deletion workflow. |

## Running isolated Playwright workers

### Build a local worker image

The build context must remain the repository root because the CI workflow and Dockerfile reference the dedicated worker manifest explicitly.

```bash
docker build \
  --file workers/playwright/Dockerfile \
  --tag atom-playwright-worker:local \
  .
```

### Enable local execution deliberately

```bash
export EXECUTION_ENABLED=true
export WORKER_MODE=isolated-image
export WORKER_IMAGE=atom-playwright-worker:local

# Restart the backend after changing environment variables.
npm run dev:backend
```

The local tag is suitable only for development. Production startup validation requires an immutable digest-form image reference such as `registry.example.com/atom/playwright@sha256:<64-hex-digest>`.

> Never add package installation to the execution path. The image’s dedicated `workers/playwright/package-lock.json` defines the worker runtime, and the container invokes the installed `playwright` binary directly.

## Configuration

### Development profile

| Variable | Suggested local value | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Enables local defaults. |
| `AUTH_MODE` | `development` | Uses explicit `X-Dev-User` and `X-Tenant-Id` headers. |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Allowed browser origin. |
| `PORT` | `3001` | API listener port. |
| `OPENAI_API_KEY` | Optional | Enables configured provider-backed generation. |
| `EXECUTION_ENABLED` | `false` by default | Must be explicitly enabled to submit runs. |
| `WORKER_IMAGE` | Empty by default | Required to execute tests. |

### Production profile

Production mode fails startup when required security controls are absent. Configure secrets through your deployment platform rather than committing them to a file.

```bash
export NODE_ENV=production
export AUTH_MODE=oidc
export JWT_SECRET='replace-with-a-strong-secret'
export ALLOWED_ORIGINS='https://atom.example.com'

export OIDC_ISSUER='https://idp.example.com'
export OIDC_AUDIENCE='atom-api'
export OIDC_JWKS_URI='https://idp.example.com/.well-known/jwks.json'
export OIDC_ROLE_MAPPING_JSON='{"atom-viewers":"viewer","atom-developers":"developer","atom-approvers":"approver","atom-admins":"admin"}'

export PERSISTENCE_MODE=postgres
export DATABASE_URL='postgresql://atom:password@postgres:5432/atom'
export QUEUE_MODE=bullmq
export REDIS_URL='redis://redis:6379'

export OBJECT_STORAGE_MODE=s3
export S3_ENDPOINT='https://s3.example.com'
export S3_BUCKET='atom-artifacts'
export S3_ACCESS_KEY_ID='replace-me'
export S3_SECRET_ACCESS_KEY='replace-me'
export S3_SSE='AES256'

export EXECUTION_ENABLED=true
export WORKER_MODE=isolated-image
export WORKER_IMAGE='registry.example.com/atom/playwright@sha256:replace-with-64-hex-digest'
export WEBHOOK_SIGNING_SECRET='replace-with-a-long-random-secret'
```

Additional controls include `AI_ALLOWED_MODELS`, `AI_DEFAULT_MODEL`, `AI_DAILY_TOKEN_BUDGET`, `MAX_RUNS_PER_TENANT`, `ARTIFACT_RETENTION_DAYS`, `POLICY_REQUIRE_APPROVAL_TAGS`, `POLICY_BLOCKED_DOMAINS`, and `POLICY_MAX_TIMEOUT_MS`. See `src/backend/config.js` for the full reference.

## CI/CD security gates

Two GitHub Actions workflows enforce the core checks:

| Workflow | Main gates |
|---|---|
| `.github/workflows/ci.yml` | Root dependency install, backend syntax checks, unit/integration tests, frontend lint/build/audit, worker image build, Trivy CVE scan, SBOM and provenance controls. |
| `.github/workflows/pr-soc2-security.yml` | SOC 2 regression tests, AI evaluation, non-destructive security simulation, dependency audits, secret scanning, worker image hardening checks, and vulnerability scanning. |

The worker image scan uses [Trivy](https://github.com/aquasecurity/trivy), which evaluates operating-system and library CVEs. It is intentionally scoped to vulnerability scanning because repository secret scanning is handled separately. The CI gate fails on fixed `HIGH` or `CRITICAL` findings.

### Image-scan troubleshooting

| Symptom | Resolution |
|---|---|
| `npm ci` fails in `src/frontend` | Use `pnpm --dir src/frontend install --frozen-lockfile`; frontend dependencies do not use an npm lockfile. |
| Trivy reports application packages inside `/opt/atom-worker/node_modules` | Confirm `workers/playwright/Dockerfile` copies `workers/playwright/package.json` and `workers/playwright/package-lock.json`, not the root manifests. |
| Buildx says an attestation requires a build reference | Local images loaded for Trivy/Dockle scans use `load: true` and disable registry-bound Buildx attestations. Keep repository SBOM/provenance generation separate. |
| Trivy cannot resolve its action version | Use the pinned commit in the workflow; do not replace it with an unverified tag. |
| SBOM attestation returns `Resource not accessible by integration` | The workflow needs `attestations: write`, `artifact-metadata: write`, and `id-token: write` permissions. |
| Docker build returns exit code 100 during `apt-get upgrade` | Do not add a distribution-wide upgrade to the worker Dockerfile. Refresh the pinned base image instead and let Trivy enforce current CVE policy. |

## Production deployment

Review and complete the operational materials before a production launch:

| Document | Purpose |
|---|---|
| [`PRODUCTION_ROLLOUT_GUIDE.md`](PRODUCTION_ROLLOUT_GUIDE.md) | Deployment phases, operational readiness, rollback, monitoring, and launch procedure. |
| [`ATOM_SECURITY_WHITEPAPER.md`](ATOM_SECURITY_WHITEPAPER.md) | Customer-facing summary of architecture and security controls. |
| [`ATOM_ENTERPRISE_SLA_DRAFT.md`](ATOM_ENTERPRISE_SLA_DRAFT.md) | Enterprise service-level commitments and support terms. |
| [`SOC2_P0_P1_REMEDIATION_BACKLOG.md`](SOC2_P0_P1_REMEDIATION_BACKLOG.md) | Remaining compliance hardening tasks and owners. |
| [`SOC2_SECURITY_VALIDATION_REPORT.md`](SOC2_SECURITY_VALIDATION_REPORT.md) | Completed validation evidence, findings, and limitations. |
| [`SOC2_CI_SECURITY_REGRESSION_TEST_SUMMARY.md`](SOC2_CI_SECURITY_REGRESSION_TEST_SUMMARY.md) | Mapping of CI gates to control objectives and failure conditions. |

## Troubleshooting

### Authentication returns `401`

In local development, confirm `AUTH_MODE=development` and include `X-Dev-User` plus `X-Tenant-Id` on API calls. In strict mode, supply a valid bearer token. In OIDC mode, configure issuer, audience, JWKS URI, and role mapping.

### Execution returns `403 unsafe_execution_denied`

This is expected when execution is disabled, no worker image is configured, or the test includes blocked APIs. Build and configure the isolated worker deliberately; do not relax the unsafe-code denylist to make a test pass.

### Execution returns `409 approval_required`

The policy engine determined that the run requires approval. Create or locate a tenant approval and include its approved ID in `X-Approval-Id` when resubmitting the run.

### Readiness returns `503`

In production, verify PostgreSQL, Redis, object storage, worker image configuration, authentication settings, and required webhook signing secret. Run `npm run verify:release` to identify missing controls.

### Frontend or backend startup fails after dependency updates

Reinstall with the lockfile appropriate to each project:

```bash
npm ci
pnpm --dir src/frontend install --frozen-lockfile
```

## Contributing

Use a feature branch, include tests for behavior changes, and run the local validation sequence before opening a pull request. Security-sensitive changes should include an updated test, a documentation update, and a review of the relevant SOC 2 control impact.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) when present in the repository.

---

**Atom** — governed AI-assisted Playwright testing with tenant-aware execution controls.
