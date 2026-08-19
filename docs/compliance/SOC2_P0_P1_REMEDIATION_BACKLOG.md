# Atom SOC 2 P0/P1 Remediation Backlog

**Status:** Implementation-ready backlog
**Baseline:** Commit `fe0b5254`
**Assessment basis:** AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy [1]
**Prepared by:** Manus AI
**Date:** 20 August 2026

> This backlog is an engineering and governance planning artifact. It is not a SOC 2 report, certification, legal opinion, or auditor-approved remediation plan. A qualified CPA firm should validate scope, control design, sampling, and operating-effectiveness requirements before the examination.

## 1. Outcome and exit criteria

The immediate objective is to move Atom from **technical control foundation** to **audit-ready operating program**. The P0 work closes conditions that could invalidate the production control design or prevent an auditor from relying on the system. The P1 work establishes repeatable operating evidence for monitoring, vendor risk, privacy, resilience, and control effectiveness.

Atom should not claim SOC 2 compliance until the following exit conditions are met:

| Exit gate | Required evidence |
|---|---|
| Production identity | OIDC/SAML login, MFA enforced by IdP, development mode impossible in production, joiner/mover/leaver tests, quarterly access review |
| Governance | Approved policies, control-owner matrix, risk register, training records, exceptions, management review minutes |
| Change management | Protected `main`, mandatory reviews and checks, deployment approvals, migration review, emergency-change records |
| Resilience | Scheduled encrypted backups, isolated restore tests, object-storage recovery, RTO/RPO exercise, failover evidence |
| Monitoring | Centralized logs, alert rules, on-call ownership, alert tickets, audit-log integrity, periodic control reviews |
| Vulnerability management | Dependency/image scan results, severity SLAs, remediation tickets, exception approvals, patch evidence |
| Privacy and vendors | Data inventory, retention/deletion controls, DPA, subprocessor register, vendor reviews, privacy request workflow |
| Type II evidence | Time-indexed evidence showing each control operated consistently throughout the examination period |

## 2. Delivery model and ownership

| Role | Primary responsibility |
|---|---|
| Executive sponsor | Approves risk appetite, policies, exceptions, budget, and quarterly control reports |
| Security/compliance owner | Owns SOC 2 program, risk register, control catalog, evidence repository, vendor/privacy process |
| Platform engineering | Owns API, identity integration, PostgreSQL/Redis/object storage, observability, backup, deployment controls |
| Product engineering | Owns test specification, policy engine, approval workflow, run state machine, evaluation harness, artifact controls |
| DevSecOps | Owns CI, branch protection, SBOM/provenance, image scanning, vulnerability SLAs, release evidence |
| IT/IAM | Owns IdP, MFA, lifecycle, privileged access, access reviews, device and endpoint requirements |
| Incident commander | Owns incident response, customer communications, timeline, corrective actions, and exercise records |
| External CPA firm | Validates scope, control design, test procedures, samples, and final SOC 2 report |

## 3. P0 tasks — complete before production SOC 2 readiness claim

### P0-01 — Fail closed for production identity and configuration

**Risk addressed:** CC6, CC5, confidentiality, tenant isolation.
**Owner:** Platform Engineering + IAM
**Dependencies:** IdP tenant/application, secret manager, production deployment pipeline.
**Target:** Week 1–2.

**Code changes**

1. Add `src/backend/identityProvider.js` implementing OIDC discovery, issuer/audience validation, JWKS caching and rotation, clock-skew tolerance, group-to-role mapping, and optional SAML assertion handoff through a supported library or identity gateway.
2. Change `src/backend/security.js` so `AUTH_MODE=development` is rejected when `NODE_ENV=production` or `EXECUTION_ENABLED=true`.
3. Require `tenant_id`, `sub`, `iss`, `aud`, `iat`, `exp`, and a mapped role claim; reject missing, stale, audience-mismatched, or unmapped claims.
4. Add `startupSecurityChecks()` in `src/backend/server.js` or `src/backend/config.js`; fail startup when production uses a placeholder JWT secret, local object storage, local persistence, development identity, wildcard CORS, mutable worker tags, or missing webhook/AI secrets.
5. Add an authorization test matrix for every protected route and a cross-tenant negative test for runs, events, artifacts, approvals, audit, quota, evaluations, and dashboard data.

**Configuration changes**

```bash
NODE_ENV=production
AUTH_MODE=oidc
OIDC_ISSUER=https://idp.example.com/realms/atom
OIDC_AUDIENCE=atom-api
OIDC_JWKS_URI=https://idp.example.com/realms/atom/protocol/openid-connect/certs
OIDC_GROUP_CLAIM=groups
OIDC_ROLE_MAPPING_JSON={"atom-viewers":"viewer","atom-developers":"developer","atom-approvers":"approver","atom-admins":"admin"}
CORS_ALLOWLIST=https://atom.example.com
DEV_AUTH_ENABLED=false
```

**Acceptance criteria**

Production boot fails closed for insecure settings. An IdP-issued token with valid signature, issuer, audience, tenant, expiry, and group reaches a protected route. Missing MFA claim or missing mapped role is denied according to the selected IdP policy. A deprovisioned user loses access on the next token/session check. A quarterly access-review export includes user, tenant, role, reviewer, date, decision, and remediation ticket.

**Evidence package**

Approved IAM architecture, IdP configuration export, MFA policy, claim-mapping tests, boot-failure logs, user lifecycle tickets, access-review sign-off, privileged-account list, and secret-rotation records.

### P0-02 — Establish the formal control environment and risk program

**Risk addressed:** CC1, CC2, CC3, CC4, CC5.
**Owner:** Security/Compliance
**Dependencies:** Executive sponsor and control owners.
**Target:** Week 1–3.

**Implementation steps**

1. Create `compliance/control-catalog.yml` with control ID, criterion, objective, procedure, owner, frequency, evidence source, reviewer, retention, and exception path.
2. Create `compliance/risk-register.yml` covering AI providers, target execution, workers, IdP, PostgreSQL, Redis, object storage, subprocessors, privacy, recovery, and supply chain.
3. Publish and approve policies: information security, access control, change management, vulnerability management, incident response, business continuity, vendor management, acceptable use, data retention, privacy, and AI governance.
4. Add a GitHub issue/project template for risk acceptance, control exceptions, incidents, access reviews, restore tests, and emergency changes.
5. Schedule quarterly management review and monthly control-owner attestations. Store signed minutes and overdue-action reports in an immutable evidence location.

**Acceptance criteria**

Every P0/P1 finding has a risk owner, due date, treatment, control mapping, and evidence source. Policies have approver, effective date, version, review date, and acknowledgment records. Management reviews risk, exceptions, incidents, availability, vulnerabilities, and overdue evidence quarterly.

**Evidence package**

Approved policies, control catalog, risk register, training/acknowledgment export, control-owner matrix, management minutes, exception register, and annual risk assessment.

### P0-03 — Enforce change management and release approvals

**Risk addressed:** CC5, CC8, processing integrity.
**Owner:** DevSecOps
**Dependencies:** GitHub administration, deployment environment, release registry.
**Target:** Week 1–2.

**Code/configuration changes**

1. Enable protected `main`: no direct pushes, two reviewers for security-sensitive paths, CODEOWNERS approval, required CI checks, linear history, and signed or provenance-linked releases.
2. Add `.github/CODEOWNERS` assigning security review to `src/backend/security.js`, `config.js`, worker Dockerfiles, migrations, CI, identity, policy, object storage, and run orchestration.
3. Split CI into required checks: backend tests, frontend build, evaluation, dependency audit, SBOM, provenance, worker scan, migration lint, and secret scan.
4. Add release workflow that publishes an immutable image digest and attaches commit SHA, SBOM, scan results, migration checksum, and approval record.
5. Add a deployment gate requiring an approved change ticket and successful canary verification.
6. Add `scripts/verify-release.js` to fail if `WORKER_IMAGE` is not digest-pinned or if the release metadata is missing required evidence.

**Acceptance criteria**

A direct push to `main` is rejected. A pull request cannot merge when any required check fails. Security-sensitive changes require a security owner. Production deployment requires a linked approval and immutable artifact digest. Emergency changes create a ticket within one business day and receive retrospective review.

**Evidence package**

Repository branch-protection export, CODEOWNERS, sampled pull requests, CI result links, release manifests, deployment approvals, migration reviews, and emergency-change retrospectives.

### P0-04 — Make production persistence, queue, storage, and worker controls enforceable

**Risk addressed:** CC6, CC7, CC9, availability, confidentiality.
**Owner:** Platform Engineering
**Dependencies:** Managed PostgreSQL, Redis, private object storage, container registry, network policy.
**Target:** Week 2–4.

**Code/configuration changes**

1. Add `STORAGE_MODE=postgres`, `QUEUE_MODE=bullmq`, and `OBJECT_STORAGE_MODE=s3`; reject local fallback modes when `NODE_ENV=production`.
2. Add PostgreSQL TLS verification, pool limits, statement timeout, migration lock, and connection health checks.
3. Configure Redis TLS/authentication, persistence policy, queue metrics, dead-letter handling, poison-job quarantine, and bounded retry behavior.
4. Require private S3 bucket, public-access block, encryption, key ID, lifecycle policy, versioning, and tenant-prefixed object keys.
5. Add worker admission validation that resolves the configured digest and checks an image-attestation allowlist before queue assignment.
6. Add network-policy tests confirming the worker can reach only explicitly approved target domains and required artifact endpoints.
7. Add `/readyz` to distinguish process liveness from dependency readiness and prevent traffic when persistence or queue health is degraded.

**Acceptance criteria**

Production startup fails when a local fallback is configured. A worker with a mutable tag or unapproved digest is rejected. A database, Redis, or storage outage produces a readiness failure and alert without silently switching to local storage. A poisoned job is quarantined and audited. Tenant object-key traversal and cross-tenant access tests fail closed.

**Evidence package**

Production configuration attestation, database/Redis/storage settings, image-attestation records, network-policy tests, readiness logs, outage tests, dead-letter samples, and access-control review.

### P0-05 — Implement tested backup, restore, and disaster recovery

**Risk addressed:** CC9, Availability.
**Owner:** Platform Engineering + SRE
**Dependencies:** Managed-service backup features, isolated restore account, object-storage versioning, observability.
**Target:** Week 2–5.

**Implementation steps**

1. Extend `scripts/backup-restore-smoke.sh` to verify scheduled backup metadata, PostgreSQL row counts/checksums, migration version, audit/run/event relationships, and object-storage manifests.
2. Add `scripts/object-storage-restore-smoke.sh` to restore a sampled artifact set into an isolated bucket and verify checksums, tenant prefixes, retention metadata, and signed-download behavior.
3. Configure encrypted daily backups, point-in-time recovery, cross-zone/cross-region copy as required, Redis recovery policy, and object versioning.
4. Add `docs/operations/DR_PLAN.md` with service dependencies, RTO/RPO, roles, escalation, decision points, communications, and validation steps.
5. Run a quarterly restore exercise and an annual disaster-recovery exercise. Record elapsed recovery time, recovered point, missing data, issues, and corrective actions.
6. Add alerts for missed backups, stale backup age, restore-test failure, object-versioning disablement, and recovery budget breach.

**Acceptance criteria**

An isolated restore reproduces runs, event history, audit records, quota state, artifact metadata, and sampled artifacts. The measured RTO/RPO meet approved targets. Backup and restore evidence is reviewed by an independent person. No restore test modifies the primary environment.

**Evidence package**

Backup schedule, immutable backup inventory, restore logs, row/checksum comparison, object checksum report, RTO/RPO results, incident/corrective-action tickets, and reviewer sign-off.

### P0-06 — Establish central monitoring, alerting, and audit-log integrity

**Risk addressed:** CC4, CC7, CC9.
**Owner:** SRE + Security Operations
**Dependencies:** SIEM/log platform, metrics backend, on-call service, alert ownership.
**Target:** Week 2–5.

**Code/configuration changes**

1. Add OpenTelemetry instrumentation for API, database, queue, worker, AI provider, storage, webhook, approval, and audit paths.
2. Emit immutable audit events for authentication changes, role changes, policy changes, approvals, artifact access/deletion, configuration changes, backup results, and privileged actions.
3. Forward structured logs to a centralized, access-controlled sink with time synchronization, retention, integrity protection, and separate security-admin access.
4. Add alert rules for authentication anomalies, cross-tenant denial spikes, audit-write failures, queue age, dead-letter growth, worker startup failure, artifact 5xx, AI budget exhaustion, webhook failures, backup age, dependency health, and configuration drift.
5. Add security and operations dashboards with owner, threshold, severity, runbook link, and alert-suppression procedure.
6. Require an alert ticket for every P1/P2 alert and review alert coverage monthly.

**Acceptance criteria**

A synthetic failure generates a central alert, pages the correct owner, creates a ticket, links to a runbook, and is closed with a documented cause. Audit records cannot be deleted by ordinary admins and are retained for the approved period. Monthly alert-review evidence shows false-positive tuning and unresolved alerts.

**Evidence package**

SIEM configuration, alert catalog, on-call schedule, synthetic test records, alert tickets, log-retention settings, audit-access review, and monthly monitoring review.

## 4. P1 tasks — complete during audit-readiness operating period

### P1-01 — Formalize vulnerability and patch management

**Risk addressed:** CC7, CC8, CC9.
**Owner:** DevSecOps + Security
**Target:** Week 4–8.

**Implementation steps**

1. Add SAST, secret scanning, container scanning, dependency review, and license-policy checks to required CI.
2. Publish remediation SLAs: Critical 7 days, High 30 days, Medium 90 days, with security-owner-approved exceptions.
3. Open an issue automatically for new high/critical findings, attach package/image, CVE, exploitability, affected release, owner, due date, and fix PR.
4. Scan running worker and API images on a schedule, not only at build time. Alert on drift from the approved digest.
5. Add `SECURITY_EXCEPTION.md` template requiring compensating control, expiry date, risk owner, and executive approval.

**Acceptance criteria and evidence**

All findings have an owner and SLA. Exceptions expire automatically. Monthly vulnerability reports show aging, closure, overdue risk, and management review. A sampled release can be traced from source commit to SBOM, image digest, scan result, deployment, and rollback artifact.

### P1-02 — Build vendor, AI-provider, and subprocessor governance

**Risk addressed:** CC9, confidentiality, privacy, availability.
**Owner:** Security/Compliance + Procurement
**Target:** Week 4–8.

**Implementation steps**

1. Create `compliance/vendor-register.yml` with provider, service, data categories, region, criticality, access, contract, DPA, assurance report, review date, and exit plan.
2. Add onboarding review for AI providers, cloud services, identity providers, Redis/PostgreSQL/storage vendors, monitoring, CI, registry, and support tools.
3. Require provider settings for no-training or equivalent data-use restriction where available, retention, region, encryption, incident notice, and subprocessors.
4. Publish a customer subprocessor list and change-notification process.
5. Run annual reassessment and event-triggered reassessment after material provider or architecture change.

**Acceptance criteria and evidence**

Every critical vendor has an executed contract/DPA or documented exception, current security evidence, data-flow classification, owner, and continuity plan. AI provider configuration is tested to ensure only approved models and data paths are used.

### P1-03 — Implement privacy operations and data lifecycle evidence

**Risk addressed:** Confidentiality, Privacy, CC2, CC9.
**Owner:** Privacy/Legal + Engineering
**Target:** Week 4–10.

**Implementation steps**

1. Create a data inventory for prompts, generated code, run metadata, artifacts, logs, audit records, identity claims, support data, and backups.
2. Add data classification and retention fields to the persistence model; separate customer content from operational metadata.
3. Implement deletion workflow with tenant authorization, approval for legal holds, object deletion, database tombstoning, backup-expiry handling, and deletion evidence.
4. Add export endpoint/job for customer-owned specifications, run metadata, events, artifacts, and audit records where contractually required.
5. Publish privacy notice, DPA, subprocessors, cross-border transfer position, and data-subject request process.
6. Add tests for retention expiry, legal hold, deletion authorization, cross-tenant deletion denial, and export completeness.

**Acceptance criteria and evidence**

A sampled deletion request produces a complete inventory, approval, deletion job, object/database result, exception list, and reviewer sign-off. Retention policy is enforced by scheduled jobs and monitored for failure. Customer-facing documents match actual retention and provider behavior.

### P1-04 — Strengthen processing integrity and evaluation assurance

**Risk addressed:** Processing Integrity, CC5, CC7.
**Owner:** Product Engineering + AI Governance
**Target:** Week 5–10.

**Implementation steps**

1. Add schema versioning and backward-compatible migration for structured test specifications.
2. Add property-based tests for state transitions, idempotency, event sequence monotonicity, cancellation races, retry behavior, and duplicate webhook delivery.
3. Add evaluation datasets for unsafe targets, sensitive data leakage, prompt injection, policy bypass, malformed code, accessibility, API correctness, and regression cases from incidents.
4. Require evaluation score, policy result, model/version, dataset version, and reviewer for every model/configuration release.
5. Add human approval for changing policy thresholds, model allowlist, redaction rules, or evaluation minimums.
6. Add reconciliation jobs comparing queue jobs, database run states, event terminal states, artifact records, and quota usage.

**Acceptance criteria and evidence**

No invalid state transition is possible. A duplicate or delayed queue/webhook event is idempotently absorbed. Every AI configuration change has an evaluation result and approval. Reconciliation reports are reviewed and all mismatches are ticketed.

### P1-05 — Complete incident response and security exercise program

**Risk addressed:** CC2, CC4, CC7, CC9.
**Owner:** Security Operations + Incident Commander
**Target:** Week 5–10.

**Implementation steps**

1. Convert `docs/runbooks/INCIDENT_RUNBOOKS.md` into versioned runbooks with severity, owner, trigger, containment, evidence preservation, customer communication, recovery, and closure criteria.
2. Add incident templates for unsafe execution, credential compromise, AI provider breach/outage, queue corruption, data exposure, ransomware/backup failure, and privacy request failure.
3. Run quarterly tabletop exercises and at least one technical exercise for worker compromise or database recovery.
4. Require post-incident review within five business days with root cause, blast radius, timeline, corrective actions, regression test, and risk-register update.
5. Add customer notification matrix covering security, availability, privacy, and planned maintenance events.

**Acceptance criteria and evidence**

Exercises meet objectives, produce timelines and action tickets, and demonstrate that on-call staff can find logs, freeze execution, rotate credentials, isolate workers, restore data, and communicate with customers. Corrective actions have owners and due dates.

### P1-06 — Enforce access reviews and privileged-operation controls

**Risk addressed:** CC1, CC5, CC6.
**Owner:** IAM + Security
**Target:** Week 4–8.

**Implementation steps**

1. Add an admin-only role/permission management API with dual approval for owner/admin changes.
2. Add `role_change`, `tenant_membership_change`, `break_glass_start`, `break_glass_end`, `secret_rotation`, and `policy_change` audit events.
3. Integrate group sync or SCIM where available; otherwise add a reviewed provisioning job and disable stale accounts.
4. Add quarterly access-review export and approval workflow for users, service accounts, roles, privileged resources, and exceptions.
5. Enforce just-in-time or time-bounded break-glass access with reason, approver, start/end timestamps, and automatic expiry.

**Acceptance criteria and evidence**

No single actor can silently grant themselves owner access. All privileged changes are audited. Quarterly review closes or remediates stale access. Break-glass credentials expire automatically and are reviewed after use.

### P1-07 — Add deployment and runtime configuration attestation

**Risk addressed:** CC5, CC7, CC8, confidentiality.
**Owner:** DevSecOps + Platform Engineering
**Target:** Week 5–9.

**Implementation steps**

1. Define a signed deployment manifest containing commit SHA, API image digest, worker digest, SBOM digest, migration version, configuration checksum, policy version, model allowlist, and release approver.
2. Validate the manifest at deployment and expose a restricted `/api/admin/runtime-attestation` endpoint for auditors/operators.
3. Add drift detection for env variables, worker image, network policy, bucket public-access setting, database TLS, Redis TLS, and CI artifact provenance.
4. Fail deployment when required controls are disabled or downgraded from the approved baseline.

**Acceptance criteria and evidence**

Every production deployment has a signed manifest and approval. Runtime attestation matches approved release metadata. Drift produces an alert and blocks or pauses execution where the setting affects tenant security.

### P1-08 — Improve supportability, SLO evidence, and customer reporting

**Risk addressed:** Availability, CC4, CC7, CC9.
**Owner:** SRE + Customer Operations
**Target:** Week 6–12.

**Implementation steps**

1. Instrument API availability, queue age, worker startup, execution duration, artifact upload, event replay, AI provider latency/error, webhook delivery, and database/Redis/storage health.
2. Define SLOs and error budgets for control plane, run submission, event replay, artifact authorization, and execution dispatch.
3. Generate monthly availability and incident reports from immutable metrics rather than manual estimates.
4. Add customer-facing status page and maintenance/incident communication workflow.
5. Link SLO breaches to corrective-action tickets and management review.

**Acceptance criteria and evidence**

Monthly reports show measurement method, uptime, incidents, exclusions, error budget, and corrective actions. Synthetics test authenticated health, run submission, event replay, artifact access, and cancellation from outside the primary deployment zone.

## 5. Recommended sequence

| Period | Work package | Exit gate |
|---|---|---|
| Days 0–14 | P0-01 identity/config fail-closed; P0-02 governance launch; P0-03 branch/release controls | Production cannot boot insecurely; policies/owners/risk register approved; protected main and required checks active |
| Days 15–30 | P0-04 production durable services; P0-05 backup/restore; P0-06 central monitoring | Managed services run in production mode; restore and alert exercises pass |
| Days 31–60 | P1-01 vulnerabilities; P1-02 vendors; P1-03 privacy; P1-06 access reviews | Operational evidence begins accumulating and all critical vendors/data flows are covered |
| Days 61–90 | P1-04 integrity/evaluation; P1-05 incidents; P1-07 attestation; P1-08 SLO reporting | Type II evidence collection starts with stable controls, reviewed exceptions, and tested recovery |

## 6. Evidence operating model

Create an evidence repository with one folder per control and a standard metadata file:

```yaml
control_id: CC6.1
period_start: 2026-09-01
period_end: 2026-09-30
owner: iam-security@example.com
system: atom-production
artifact_type: access-review
source_url: https://evidence.example.com/atom/cc6.1/2026-09
reviewer: security-manager@example.com
reviewed_at: 2026-10-05T12:00:00Z
exception_ids: []
retention_until: 2033-10-05
```

Evidence must be generated at the time of control operation, protected from unauthorized editing, reviewed by a separate person where practical, and retained for the examination period plus the organization's legal and audit-retention requirement. Do not rely on screenshots alone when an export, query result, ticket, or signed system record is available.

## 7. First ten tickets to create

| Ticket | Title | Immediate deliverable |
|---|---|---|
| ATOM-SOC2-001 | Enforce production OIDC/SAML and MFA | Identity adapter, fail-closed startup, claim tests |
| ATOM-SOC2-002 | Create SOC 2 control catalog and risk register | Approved control/risk files and owners |
| ATOM-SOC2-003 | Protect main and enforce release approvals | Branch rules, CODEOWNERS, required checks |
| ATOM-SOC2-004 | Remove production local fallbacks | Startup validation and production config tests |
| ATOM-SOC2-005 | Execute isolated PostgreSQL/object restore | Restore report with RTO/RPO measurements |
| ATOM-SOC2-006 | Centralize audit/logging and create alerts | SIEM sink, alert catalog, synthetic alert evidence |
| ATOM-SOC2-007 | Implement vulnerability SLAs and exceptions | Automated tickets and monthly vulnerability report |
| ATOM-SOC2-008 | Complete vendor/subprocessor and AI-provider reviews | Vendor register, DPAs, provider settings |
| ATOM-SOC2-009 | Implement data inventory, deletion, and export | Data map, retention/deletion tests, DSR workflow |
| ATOM-SOC2-010 | Run security tabletop and worker-compromise exercise | Exercise report and corrective-action tickets |

## References

[1]: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022 "AICPA & CIMA — 2017 Trust Services Criteria with Revised Points of Focus — 2022"
[2]: https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services "AICPA & CIMA — System and Organization Controls: SOC Suite of Services"
