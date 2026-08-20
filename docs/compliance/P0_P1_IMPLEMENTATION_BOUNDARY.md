# P0/P1 Implementation Boundary

**Date:** 20 August 2026  
**Purpose:** Distinguish controls implemented and validated in the Atom repository from controls that require a production environment, third parties, or evidence accumulated over time.

> This document is a release boundary, not a SOC 2 attestation. A repository cannot create executed contracts, configure a customer’s identity provider, operate an on-call rotation, perform a restore exercise, or establish Type II operating effectiveness by itself.

## Repository-Enforceable Controls Completed

| Backlog area | Implemented and regression-checked control |
|---|---|
| **P0-01 Identity/configuration** | Production validation requires OIDC, durable services, secure origins, Redis TLS, database TLS attestation, encrypted/versioned/lifecycle-managed private object storage attestation, a KMS key identifier, signed webhooks, and immutable worker digests. |
| **P0-02 Control environment** | Version-controlled control catalog and risk register now assign owners, evidence, treatment, dependencies, review cadence, and exception paths to core controls. |
| **P0-03 Change/release baseline** | CODEOWNERS, SBOM/provenance, secret/image/dependency scanning, release verification, P0/P1 guard workflows, and release-attestation fields are present in the repository. |
| **P0-04 Execution/storage** | Isolated non-root digest-pinned worker model, per-run results mount, local artifact file/byte quotas, domain policy, approval binding, and fail-closed managed-egress prerequisites are enforced. |
| **P0-05 Recovery design** | Backup/restore smoke assets and the disaster-recovery plan are version controlled. |
| **P0-06 Monitoring design** | Structured logging, correlation IDs, audit flows, observability documentation, and security simulations are present. |
| **P1-01 Vulnerability process** | CI security checks, SBOM, exception template, and release control gate are present. |
| **P1-02 Vendor governance** | Vendor/subprocessor register template and risk linkage are present. |
| **P1-03 Privacy** | Data inventory and deletion/export/retention planning artifacts are present. |
| **P1-04 Processing integrity** | Versioned test specifications, approval binding, evaluation gate, state/idempotency regressions, and declarative API chaining are present. |
| **P1-05 Incident readiness** | Runbooks and exercise templates are present. |
| **P1-06 Access reviews** | Integrity-hashed access-review generation and expiring exceptions are present. |
| **P1-07 Attestation** | Release manifest validation and P1 release guard are present. |
| **P1-08 Supportability** | SLO/observability designs and reporting templates are present. |

## Dynamic API Parameter Chaining

Atom now validates `api-test-plan/v1` plans in which a restricted JSONPath value is extracted from one successful response and substituted into a subsequent relative request path, header, or JSON body. Forward references, duplicate values, arbitrary expressions, unsafe JSONPath properties, absolute URLs, arbitrary scripts, secret leakage in result records, failed-response extraction, and dependent execution after a failed assertion are denied or prevented. See [`API_PARAMETER_CHAINING.md`](../architecture/API_PARAMETER_CHAINING.md).

Actual remote API execution remains deliberately denied until a managed egress proxy, target allowlist, environment registry, secret broker, runtime DNS/redirect validation, and byte/rate quotas are deployed and independently tested.

## Production and Operating Requirements Still Required

| Area | Required external action | Why repository changes are insufficient |
|---|---|---|
| Identity | Configure OIDC application, MFA, group/role claims, lifecycle deprovisioning, and quarterly review | These are IdP and IAM operations. |
| Source control | Enable protected main, reviewer rules, required checks, environments, and deployment approvals | These are GitHub organization/repository settings. |
| Durable services | Provision managed PostgreSQL, Redis, private S3/object store, KMS, image registry, proxy, and network policy | Runtime resource settings and tenant accounts do not belong in source control. |
| Remote execution | Deploy proxy-only egress, DNS and redirect validation, registered targets, secret broker, and worker admission | Enabling network access before these controls are live violates the release gate. |
| Backups/DR | Configure schedules, immutable retention, isolated restore account, RTO/RPO, and recurring exercises | Evidence must be captured from actual production services. |
| Monitoring | Connect SIEM/metrics/paging/ticket systems; define owner schedules and test alerts | Central monitoring is an operational service. |
| Vulnerability management | Create tickets for real findings, track SLA aging, schedule running-image scans, approve expiring exceptions | CI findings must be managed over time. |
| Vendors/privacy | Execute DPAs and contracts, publish subprocessors, operate data-subject workflows, and review providers | Legal and procurement action is required. |
| SOC 2 evidence | Perform recurring reviews, training, exercises, management meetings, and independent audit sampling | SOC 2 Type II evaluates operating effectiveness over time. |

## Release Position

Atom’s repository controls can be released only in the documented **fail-closed** posture. The product is suitable for controlled development, non-networked isolated execution, and preparation for a production pilot. It is not authorized by this repository to perform public/remote target testing or to claim SOC 2 certification or Type II operating effectiveness.
