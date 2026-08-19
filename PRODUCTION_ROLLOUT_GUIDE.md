# Atom Production Deployment and Rollout Guide

**Document owner:** Platform Engineering
**Scope:** Enterprise Atom deployment with governed AI generation, durable runs, isolated workers, private artifacts, RBAC, audit, approvals, webhooks, CI assurance, and recovery controls.

## 1. Production objective

Atom should be deployed as a stateless control plane plus an isolated execution plane. The control plane authenticates requests, derives tenant context, validates structured test specifications, applies policy, records audit evidence, submits idempotent durable jobs, and exposes replayable run events. The execution plane runs only an immutable, scanned worker image and must not share the API process filesystem, credentials, or unrestricted network access.

The recommended production topology is shown in [`ATOM_DEPLOYMENT_ARCHITECTURE.mmd`](./ATOM_DEPLOYMENT_ARCHITECTURE.mmd). The deployment must treat PostgreSQL, Redis, and object storage as independent durable services with backups, monitoring, and tested restoration procedures.

## 2. Required production services

| Service | Responsibility | Production requirement |
|---|---|---|
| Edge gateway | TLS termination, WAF, request limits, routing, correlation propagation | Managed WAF/API gateway with TLS 1.2+ and access logs |
| Atom API | Authentication, policy, API, dashboard, event replay | At least two stateless replicas behind a load balancer |
| PostgreSQL | Run state, idempotency, events, approvals, audit, artifacts, quotas | Managed HA PostgreSQL with encryption, backups, PITR, and restricted network access |
| Redis | BullMQ job dispatch and retry state | Managed Redis with persistence, authentication, TLS, and capacity alarms |
| Object storage | Private screenshots, videos, traces, reports, and SBOMs | Versioning, encryption, lifecycle policy, deny-public-access posture |
| Worker pool | Playwright test execution | Immutable image, non-root, read-only root, no default network, CPU/memory/PID limits |
| Identity provider | OIDC/SAML login and group mapping | MFA, conditional access, group-to-role mapping, session and offboarding controls |
| Observability | Logs, metrics, traces, audit evidence | Centralized retention, alerting, tenant-safe dashboards, time synchronization |

## 3. Prerequisites and access model

Before deployment, create separate production identities for the API, queue workers, database migration job, artifact service, and CI. Use short-lived workload identity where supported. Do not place provider keys, database passwords, webhook secrets, or worker registry credentials in the repository or frontend environment.

Create an enterprise IdP application and map groups to Atom roles. A recommended initial mapping is `atom-viewers → viewer`, `atom-developers → developer`, `atom-approvers → approver`, `atom-admins → admin`, and a tightly controlled platform group → owner. Require MFA through the IdP and test joiner, mover, and leaver workflows before enabling customer traffic.

## 4. Configuration baseline

Start from `.env.example`, but inject secrets through a production secret manager. The following settings are mandatory before execution is enabled:

```bash
NODE_ENV=production
AUTH_MODE=strict
JWT_SECRET=<managed-secret-or-oidc-verifier-secret>
ALLOWED_ORIGINS=https://atom.example.com
DATABASE_URL=<managed-postgresql-url>
REDIS_URL=<managed-redis-tls-url>
S3_ENDPOINT=<private-object-storage-endpoint>
S3_BUCKET=atom-production-artifacts
S3_ACCESS_KEY_ID=<workload-identity-or-access-key>
S3_SECRET_ACCESS_KEY=<secret-manager-value>
AI_ALLOWED_MODELS=<approved-model-list>
AI_DAILY_TOKEN_BUDGET=<tenant-approved-budget>
POLICY_REQUIRE_APPROVAL_TAGS=payment,production,destructive
POLICY_BLOCKED_DOMAINS=169.254.169.254,metadata.google.internal
WEBHOOK_SIGNING_SECRET=<managed-secret>
EXECUTION_ENABLED=false
WORKER_MODE=isolated-image
WORKER_IMAGE=<registry>/atom-playwright-worker@sha256:<immutable-digest>
```

Keep `EXECUTION_ENABLED=false` until the worker image, policy rules, egress controls, and smoke tests have passed. Enable production execution only with an immutable image digest; never use a mutable `latest` tag.

## 5. Build and supply-chain gate

Every pull request must run backend syntax checks, unit/integration tests, frontend lint/build, dependency audit, dependency review, SBOM generation, and worker image vulnerability scanning. Main-branch artifacts must carry provenance attestations. The deployment system should permit only images whose digest, SBOM, scan result, and source commit are recorded in the release metadata.

The minimum release gate is:

```bash
npm ci
cd src/frontend && npm ci && cd ../..
npm run lint:backend
npm test
npm run evaluate:ai
npm run build
npm audit --audit-level=high
```

The evaluation harness must meet the configured minimum score. A failed evaluation, high-severity dependency result, critical worker-image finding, missing provenance, or missing migration review blocks promotion.

## 6. Database, queue, and storage initialization

Provision the managed services in a private network. Apply `infra/migrations/001_enterprise_foundation.sql` through a one-shot migration job using a database role that cannot be used by the API at runtime. Verify that unique `(tenant_id, idempotency_key)` enforcement exists before accepting execution traffic.

Create the private object-storage bucket with default encryption, versioning, public-access blocking, lifecycle expiration aligned with the approved retention policy, and access logs. Configure Redis TLS and authentication, then verify that queue jobs survive an API restart and that duplicate run submissions resolve to the same run ID.

Run the backup smoke test against a non-production restore target:

```bash
export DATABASE_URL=<production-read-replica-or-backup-source>
export RESTORE_DATABASE_URL=<isolated-restore-target>
npm run backup:restore:smoke
```

Do not perform destructive restore operations against the primary database. The restore target must be isolated and disposable.

## 7. Deployment sequence

### Phase A: Provision and validate

Provision PostgreSQL, Redis, object storage, secrets, the IdP application, the edge gateway, observability, and the worker registry. Apply the schema migration. Deploy the API with execution disabled. Verify health, authentication failure behavior, tenant isolation, RBAC, audit writes, dashboard access, and artifact authorization.

### Phase B: Shadow and canary

Deploy the worker image to a canary pool with no customer execution permissions. Run synthetic tests against approved non-production targets. Validate queue assignment, state transitions, event replay after WebSocket disconnect, cancellation, artifact upload, retention metadata, signed webhooks, and PostgreSQL event persistence.

Enable a small internal tenant allowlist. Use a feature flag or policy condition to restrict execution to that allowlist. Monitor API latency, queue age, worker startup failures, execution duration, artifact upload errors, policy denials, approval latency, webhook failures, and tenant quota exhaustion.

### Phase C: Controlled customer rollout

Expand the allowlist in waves. Keep execution disabled for new tenants until their target domains, egress policy, quota, retention period, and IdP groups have been reviewed. Require approval for production, payment, and destructive tags. Review audit events daily during the initial rollout and compare run counts with quota usage.

### Phase D: General availability

Declare general availability only after the canary has completed the agreed observation period without unresolved high-severity incidents, backup restoration has succeeded, the worker image is immutable and scanned, and customer-facing security documentation has been published. Maintain a rollback image digest and previous application release for immediate reversal.

## 8. Verification checklist

| Control | Verification |
|---|---|
| Authentication | Unauthenticated requests receive 401; invalid tenant claims cannot access another tenant |
| RBAC | Viewer cannot create/cancel runs; approver can decide approvals; admin can access audit/evaluation controls |
| Idempotency | Repeating the same tenant/idempotency key returns the original run ID |
| Policy | Blocked domains and unsafe code are denied; sensitive tags create approval requirements |
| Worker isolation | Worker is non-root, read-only, resource-limited, network-restricted, and pinned by digest |
| Event replay | Disconnect and reconnect with `after=N`; no event gaps or duplicate sequence numbers |
| Cancellation | Queued jobs are removed; active worker process is terminated; run becomes cancelled and is audited |
| Artifacts | Cross-tenant artifact lookup returns 404; download URL expires; expired objects are deleted and tombstoned |
| Webhooks | Signature validates with timestamp tolerance; tampered and stale payloads are rejected |
| Recovery | Backup manifest includes runs, events, audit, and artifacts; isolated restore query succeeds |
| AI governance | Model outside allowlist is rejected; budget exhaustion is visible and audited; evaluation score meets threshold |

## 9. Rollback procedure

If a deployment causes elevated errors, policy bypass, queue corruption, or unsafe execution, stop new submissions at the edge and set `EXECUTION_ENABLED=false`. Preserve logs and audit events. Drain or cancel queued work according to the incident commander decision. Roll back the API and worker image to the last known-good immutable versions, then verify migrations are backward-compatible before reopening traffic.

Never roll back by deleting PostgreSQL rows or object-storage data. If a schema issue is suspected, restore a backup to an isolated target, reproduce the problem, and use a reviewed forward migration or controlled database rollback plan. Rotate credentials when the incident could have crossed a trust boundary.

## 10. Operations and SLO starting points

Start with a 99.9% monthly control-plane availability target, a p95 API response target below 500 ms for non-execution requests, a queue age alert at five minutes, and a worker startup failure alert above 2%. Alert on PostgreSQL connection exhaustion, Redis memory pressure, object-storage 5xx responses, webhook failure rate, AI budget exhaustion, policy-denial spikes, audit-write failures, and backup verification failures.

Use [`runbooks/INCIDENT_RUNBOOKS.md`](../runbooks/INCIDENT_RUNBOOKS.md) for unsafe execution, AI-provider, queue, and recovery incidents. Every incident must produce a timeline, affected-tenant assessment, root cause, corrective actions, and a regression test for the escaped defect.

## 11. Ownership and change control

Platform Engineering owns infrastructure, deployment, backups, and observability. Security Engineering owns policy defaults, identity mappings, supply-chain gates, incident response, and customer security evidence. Product Engineering owns API contracts, state-machine behavior, dashboard correctness, and evaluation datasets. Customer or application teams own target-environment allowlists, test data classification, and approval decisions.

Changes to worker images, policy defaults, model allowlists, retention, identity mappings, webhook secrets, or database migrations require peer review and a documented rollout plan. Emergency changes must be followed by retrospective review and permanent code or configuration controls.
