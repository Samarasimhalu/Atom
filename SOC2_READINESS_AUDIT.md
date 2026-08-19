# Atom SOC 2 Readiness Audit

**Status:** Draft readiness assessment — not a SOC 2 report or certification
**Commit assessed:** `fe0b5254` — `Add enterprise governance and production rollout`
**Assessment date:** 20 August 2026
**Prepared by:** Manus AI

> **Important limitation:** This is an engineering readiness assessment based on the repository and available implementation evidence. A SOC 2 examination must be performed by an independent licensed CPA firm under the applicable AICPA attestation standards. This document does not establish that Atom is SOC 2 compliant or that any control operated effectively over a specified period.

## Executive conclusion

Atom's latest commit establishes a credible **technical control foundation** for a future SOC 2 program. It includes authentication and tenant context, RBAC, structured logging, correlation IDs, durable run and event persistence, policy and approval checks, isolated worker execution, private artifact handling, CI security checks, incident runbooks, backup smoke-test tooling, and customer security documentation.

Atom is **not yet audit-ready for a SOC 2 Type II examination** and should not make a SOC 2 attestation or certification claim. The repository demonstrates control intent and some implementation evidence, but it does not demonstrate that controls are formally approved, consistently operated, independently reviewed, evidenced over time, or supported by the required organizational, vendor, privacy, and availability processes.

The most significant blockers are **identity lifecycle and MFA evidence, production-only configuration enforcement, centralized monitoring and alerting, tested backup restoration and disaster recovery, formal change management and access review, vulnerability-management operations, vendor/subprocessor governance, privacy processes, and a defined evidence-retention program**.

## Overall readiness rating

| Domain | Rating | Conclusion |
|---|---:|---|
| Technical security design | Partially implemented | Strong foundations exist, but production enforcement and operational evidence are incomplete |
| SOC 2 control environment | Not evidenced | Policies, ownership, training, risk management, and management review are not in the repository evidence |
| Availability | Not ready | HA services are recommended in documentation, but no operating evidence, SLO reports, RTO/RPO tests, or DR exercise evidence is present |
| Processing integrity | Partially implemented | Schema, policy, state machine, idempotency, evaluation, and event replay exist; production correctness evidence is absent |
| Confidentiality | Partially implemented | Tenant scoping and private artifacts exist; encryption, key management, DLP, and production configuration evidence are incomplete |
| Privacy | Not evidenced | No complete privacy notice, data inventory, DPA/subprocessor process, rights handling, or privacy control evidence is present |
| Type I readiness | Conditional | Could become design-ready after governance and production configuration controls are documented and tested |
| Type II readiness | Not ready | Operating effectiveness over an examination period is not demonstrated |

## Scope and method

The assessment reviewed the latest commit, backend and frontend source, infrastructure definitions, CI workflow, migration, worker Dockerfile, tests, evaluation dataset, security documentation, rollout guide, runbooks, and backup script. The assessment maps observations to the AICPA Trust Services Criteria, which define criteria for evaluating controls over the security, availability, processing integrity, confidentiality, and privacy of information and systems used to provide products or services [1].

The assessment separates **design evidence** from **operating evidence**. Source code, configuration, tests, and workflow definitions can support design assertions. They do not by themselves prove that personnel followed procedures, that production settings were enforced, that alerts were reviewed, or that backups and restorations succeeded over time.

## Evidence inventory

| Evidence | What it supports | Limitation |
|---|---|---|
| `src/backend/security.js` | JWT authentication path, tenant context, RBAC permission map, headers, rate limiting | Development identity fallback exists; OIDC/SAML lifecycle is not implemented; no production access-review evidence |
| `src/backend/persistence.js` and migration | Runs, event history, audit, artifacts, quota tables; tenant filters | Local file fallback remains available; no database HA, backup, restore, or migration execution evidence |
| `src/backend/runService.js` and `runQueue.js` | State machine, idempotency, queue dispatch, cancellation, replayable events | Redis/BullMQ production behavior and failure recovery are not demonstrated |
| `workers/playwright/Dockerfile` and executor | Non-root worker image, read-only root, no network, limits, runtime-install denial | Image digest, registry policy, vulnerability results, egress allowlist, and production runtime evidence are absent |
| `.github/workflows/ci.yml` | Tests, audit, SBOM, provenance, dependency review, image scan intent | Workflow execution, branch protection, artifact retention, failure triage, and exception process are not evidenced |
| `SECURITY.md`, rollout guide, runbooks | Customer communication and operational intent | Documentation is not proof of implemented or operating controls |
| Tests and evaluation harness | Unit/integration coverage for selected boundaries and deterministic evaluation | Coverage is narrow; no production integration, restore, IdP, queue failover, alert, or security-incident exercise |

## Trust Services Criteria mapping

The following mapping uses the five AICPA Trust Services Criteria categories. Security/Common Criteria are expected in every SOC 2 scope; Availability, Processing Integrity, Confidentiality, and Privacy are included only when selected in the service organization's examination scope.

### CC1 — Control environment

**Assessment: Not ready — High risk.** The repository does not evidence an approved information-security policy, code of conduct, security roles, competency and training records, background-screening requirements, management oversight, or segregation of duties. The rollout guide names engineering and security ownership, but ownership statements are not approved policies or operating evidence.

**Required remediation:** Approve an information-security program charter; assign control owners; establish annual security awareness and role-based training; document background-check and acceptable-use requirements; establish management review minutes; define engineering/security separation for production approval, access review, and incident closure.

### CC2 — Communication and information

**Assessment: Partially ready — Medium risk.** `SECURITY.md`, `ENTERPRISE_FOUNDATION.md`, incident runbooks, customer security documentation, structured audit events, and correlation IDs provide a strong communication baseline. However, the repository does not evidence a formal control catalog, versioned internal policies, security exception register, customer notification procedure, or management reporting cadence.

**Required remediation:** Create a controlled policy repository, control catalog, evidence index, exception workflow, customer security-notification procedure, and quarterly management security report.

### CC3 — Risk assessment

**Assessment: Not ready — High risk.** The policy engine blocks unsafe code and targets, and the rollout guide identifies operational risks. There is no evidence of an enterprise risk register, risk scoring methodology, annual risk assessment, threat model approval, vendor risk assessment, or documented risk acceptance.

**Required remediation:** Maintain a risk register covering AI providers, workers, target environments, identity, data, infrastructure, vendors, and recovery. Conduct an annual and change-triggered risk assessment. Link risks to controls, owners, due dates, and accepted residual risk.

### CC4 — Monitoring activities

**Assessment: Partially ready — High risk.** Structured logs, correlation IDs, audit events, dashboard metrics, runbooks, and rollout monitoring targets exist. There is no evidence of centralized SIEM ingestion, alert rules, on-call ownership, log integrity controls, alert-response records, periodic access review, control self-assessment, or independent monitoring.

**Required remediation:** Centralize logs and audit records; define alert thresholds and on-call escalation; retain evidence of alert triage; monitor control failures such as audit-write errors, policy bypass attempts, queue age, backup failures, authentication anomalies, and worker image drift; perform quarterly control-owner reviews.

### CC5 — Control activities

**Assessment: Partially ready — High risk.** RBAC, policy enforcement, approval workflow, idempotency, state transitions, isolated worker controls, CI gates, and artifact authorization are implemented. The design does not yet evidence segregation of duties, production deployment approvals, access recertification, policy change approval, dual control for sensitive operations, or enforcement against all production configuration paths.

**Required remediation:** Add protected-branch rules, mandatory peer review, release approval, production configuration validation, privileged-action dual control, quarterly access recertification, and a formal exception process.

### CC6 — Logical and physical access controls

**Assessment: Not ready — Critical risk.** The API has signed JWT verification, tenant context, role permissions, protected routes, secure headers, and rate limits. However, the latest commit only provides OIDC/SAML configuration points rather than a complete enterprise identity flow. MFA, user provisioning/deprovisioning, session management, key rotation, service-account lifecycle, privileged access management, break-glass access, access reviews, and physical/cloud provider controls are not evidenced. Development authentication is still available through configuration and local storage fallbacks are not suitable for production.

**Required remediation:** Implement or integrate production OIDC/SAML with MFA and group mapping; disable development mode at startup in production; validate issuer, audience, signature rotation, expiry, and clock skew; implement joiner/mover/leaver controls and quarterly access reviews; use workload identity and secret-manager rotation; document cloud-provider physical and logical access responsibilities.

### CC7 — System operations

**Assessment: Partially ready — High risk.** The worker image removes runtime dependency installation, the executor has hard timeout and cancellation, the queue has retries, and runbooks cover incident classes. No evidence demonstrates centralized vulnerability management, patch SLAs, operational alerting, tested incident response, production job recovery, log retention, or endpoint/network monitoring.

**Required remediation:** Establish vulnerability scanning and remediation SLAs; monitor worker and dependency drift; run incident exercises; record operational tickets; test queue replay and poison-job handling; define log retention and integrity; demonstrate production alert-to-resolution records.

### CC8 — Change management

**Assessment: Not ready — Critical risk.** The CI workflow defines tests, dependency audit, SBOM, provenance, and image scanning. It does not prove that main is branch-protected, reviews are mandatory, deployments require approval, emergency changes are reviewed, migration changes are controlled, or CI failures block release. The latest commit itself was pushed successfully, but that is not evidence of an approved change-management process.

**Required remediation:** Enforce protected branches, required reviews, status checks, signed commits or equivalent provenance, deployment approvals, migration review, rollback testing, emergency-change retrospectives, and immutable release records.

### CC9 — Risk mitigation

**Assessment: Not ready — High risk.** The repository includes a backup/restore smoke-test script, private storage, lifecycle cleanup, and a recovery runbook. The script creates a dump, checks a manifest, and optionally restores to a supplied target; no evidence shows scheduled backups, successful restore tests, RTO/RPO achievement, object-storage restoration, vendor continuity, or capacity planning.

**Required remediation:** Execute scheduled backups, encrypt and access-control backup copies, test restoration at least quarterly, include object-storage recovery, record RTO/RPO results, test regional/service failure, maintain vendor/subprocessor reviews, and document capacity thresholds.

## Availability, processing integrity, confidentiality, and privacy

| Criterion | Readiness | Key observations |
|---|---|---|
| Availability | Not ready | Documentation recommends HA PostgreSQL/Redis and SLOs, but no uptime history, monitoring, DR tests, capacity evidence, or executed failover tests are present |
| Processing integrity | Partially ready | Structured specifications, policy checks, state machine, idempotency, evaluation harness, and event replay are strong design controls; test correctness, reconciliation, duplicate suppression under failure, and production data-quality evidence are incomplete |
| Confidentiality | Partially ready | Tenant-scoped queries, private artifacts, signed URLs, encryption configuration, and secret redaction exist; local fallbacks, incomplete key-management evidence, no DLP/classification program, and no validated provider/subprocessor controls remain |
| Privacy | Not ready | No documented data inventory, purpose/retention basis, privacy notice, data-subject request workflow, deletion verification, subprocessors register, DPA, cross-border transfer assessment, or privacy incident process is evidenced |

## Material findings and priority plan

| Priority | Finding | Why it blocks SOC 2 readiness | Minimum remediation |
|---|---|---|---|
| P0 | Production identity lifecycle and MFA are not implemented/evidenced | CC6 access-control design and operating effectiveness cannot be demonstrated | Integrate IdP, enforce MFA, disable development mode, implement lifecycle and access reviews |
| P0 | Governance program evidence is absent | CC1–CC5 require organizational controls, not only code | Approve policies, owners, training, risk register, exceptions, management review, and evidence retention |
| P0 | Availability and recovery are not evidenced | Availability/CC9 cannot be supported by recommendations alone | Run HA services, scheduled backups, restore tests, RTO/RPO exercises, and failover tests |
| P0 | Change-management enforcement is not evidenced | CC8 cannot rely on a workflow file alone | Protect main, require reviews/checks, approve deployments, control migrations, retain release evidence |
| P1 | Centralized monitoring and incident evidence are absent | CC4/CC7 require ongoing monitoring and response evidence | SIEM, alerting, on-call, log integrity, alert tickets, incident exercises |
| P1 | Vendor, AI provider, and subprocessor governance is absent | CC9 and confidentiality/privacy scope third parties | Vendor inventory, security reviews, contracts, DPAs, subprocessors, model-provider data controls |
| P1 | Privacy program is absent | Privacy cannot be asserted without process and evidence | Data inventory, notices, retention/deletion, DSR workflow, transfer assessment |
| P1 | Production enforcement of secure configuration is incomplete | Code paths allow development/local fallbacks | Startup fail-closed checks, policy-as-code deployment validation, production config attestation |
| P2 | Test and evaluation coverage is too narrow for Type II evidence | Design tests do not prove operating effectiveness | Add integration, failover, restore, IdP, queue, artifact, alert, and security-exercise tests |

## Audit-ready evidence package to build

Maintain a time-indexed evidence repository containing approved policies, control-owner matrix, risk register, training records, background-check attestations, IdP configuration and access reviews, production configuration attestations, code-review and deployment records, CI results, SBOM/provenance, vulnerability tickets, backup/restore reports, DR tests, incident tickets, alert reviews, vendor assessments, privacy records, customer notifications, and quarterly management sign-offs.

Each evidence item should include control ID, owner, period, system/environment, source, timestamp, reviewer, exception reference, and retention date. A service auditor should be able to trace every control assertion to a population, sample, execution record, and review sign-off.

## Final opinion

Atom should be described externally as **SOC 2 readiness in progress** or **designed with SOC 2-oriented controls**, not as SOC 2 compliant, certified, or attested. The next gate is not additional feature development; it is formalizing and operating the control environment, production identity, change management, monitoring, vendor/privacy program, and recovery evidence for a sustained period.

## References

[1]: https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022 "AICPA & CIMA — 2017 Trust Services Criteria with Revised Points of Focus — 2022"
[2]: https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services "AICPA & CIMA — System and Organization Controls: SOC Suite of Services"
