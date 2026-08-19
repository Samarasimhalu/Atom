# Atom Enterprise Security Whitepaper

**Draft — for customer, security, and legal review before publication**
**Version:** 1.0
**Date:** 20 August 2026
**Product:** Atom enterprise AI-assisted testing platform

> **Status statement:** This whitepaper describes Atom's security architecture and intended enterprise controls. It is not a SOC 2 report, certification, legal representation, or substitute for the service's executed contract, data-processing agreement, or independent assurance report.

## Executive summary

Atom is designed as a governed AI testing platform with a stateless control plane and isolated execution plane. The control plane authenticates requests, derives tenant context, validates structured test specifications, applies policy, records audit events, submits idempotent durable runs, and exposes replayable event history. The execution plane uses a prebuilt worker image to run browser tests with no runtime dependency installation, restricted privileges, resource limits, hard timeouts, and network controls.

Atom's enterprise design emphasizes five security properties: **tenant isolation, controlled execution, governed AI use, durable accountability, and recoverability**. Production customers should deploy Atom with enterprise identity, managed PostgreSQL, managed Redis, private object storage, centralized monitoring, immutable worker images, and tested backup and restoration procedures.

## Architecture and trust boundaries

The customer request enters through the customer's browser or API client and an enterprise edge gateway. The API authenticates the caller and maps identity claims to a tenant and role. A policy engine evaluates the structured test specification before a run is queued. Sensitive tags or production targets can require explicit approval. Durable metadata is stored in PostgreSQL, queue work is dispatched through Redis/BullMQ, and artifacts are written to private S3-compatible storage.

Workers are separate from the API process. A production worker image should run as a non-root user with a read-only root filesystem, dropped Linux capabilities, CPU/memory/PID limits, a hard timeout, and restricted egress. Customer target access should use an explicit allowlist and environment-specific credentials. The customer remains responsible for the security of the target environment and the test data supplied to Atom.

## Identity and tenant isolation

Atom derives tenant context from authenticated claims rather than trusting a request-body tenant identifier. API routes apply tenant filters to runs, event history, audit records, approvals, and artifact metadata. RBAC roles include viewer, developer, approver, admin, and owner, with permissions for run creation, cancellation, approval, artifact access, audit access, dashboard access, and evaluation administration.

Production deployments should integrate an enterprise OIDC or SAML identity provider, enforce MFA through that provider, map groups to least-privilege roles, and disable development authentication. Provisioning, deprovisioning, privileged access, break-glass access, session duration, signing-key rotation, and quarterly access reviews should be operated by the service provider.

## AI governance

All configured model calls pass through the AI gateway. The gateway supports model allowlists, input and output budgets, request timeouts, basic secret redaction, tenant-attributed usage accounting, and structured provider logging. Customers should configure only approved models and should confirm the provider's data-use, retention, region, and subprocessors terms before sending customer data.

Generated output is normalized into a structured test specification containing purpose, type, target, environment, browser, tags, steps, assertions, timeout, retries, and code. The policy engine can block unsafe code patterns, restricted metadata-service domains, and excessive timeouts. Production, payment, destructive, or other sensitive tags can require an approval decision before execution. The evaluation harness scores generated tests for specification validity, policy compliance, required content, and latency.

Customers should not include secrets, regulated data, or unnecessary personal data in prompts. Atom's gateway controls do not by themselves guarantee that a third-party model provider will not retain or process content; provider-specific contractual and technical controls remain necessary.

## Execution safety

Atom denies execution unless a hardened worker image is explicitly enabled and configured. Runtime package installation is disabled. The worker image should be built from a committed lockfile, scanned for vulnerabilities, published by immutable digest, and admitted only when the CI supply-chain controls pass.

The execution state machine records requested, validated, queued, assigned, running, artifact collection, and terminal states. Idempotency keys prevent duplicate submissions within a tenant. Cancellation removes queued jobs and attempts to terminate active worker processes. Sequence-numbered events allow a disconnected client to resume from a known event offset.

## Data protection and artifacts

Run metadata, event history, audit events, quota usage, and artifact metadata are stored in PostgreSQL. Screenshots, videos, traces, and reports are stored as private objects. Artifact access first authorizes the requesting tenant, then returns a short-lived signed download URL. Retention metadata determines when objects are deleted and records tombstoned.

Production deployments should enforce encryption in transit, encryption at rest, managed key rotation, private networking, public-access blocking, object versioning where required, and lifecycle policies. The provider should maintain a data inventory that distinguishes prompts, generated code, run results, artifacts, audit records, identity claims, and operational logs.

## Availability and resilience

The recommended production architecture uses highly available managed PostgreSQL, durable Redis, private versioned object storage, multiple stateless API replicas, and a worker pool that can scale within target-environment capacity. The provider should define and publish service-level targets, queue-age alarms, database and storage alarms, recovery objectives, and maintenance practices.

Backup and restoration procedures should be scheduled, encrypted, access-controlled, and tested against isolated targets. A backup manifest must include run records, event history, audit records, and artifact metadata. Restoration tests should verify both database state and object-storage correspondence, not merely the existence of a dump file.

## Monitoring, audit, and incident response

Atom emits structured request, AI gateway, queue, run, artifact, and WebSocket events with correlation identifiers. Production operation should centralize these records in a tamper-resistant logging platform, define alert thresholds, and retain evidence of alert review and incident response. The service provider should maintain runbooks for unsafe execution, provider outage, queue backlog, database/storage recovery, credential rotation, and customer notification.

Customers should receive timely notification of confirmed security incidents affecting their data in accordance with the executed agreement. Incident communications should identify the affected service, known impact, containment actions, customer actions, and the next update time without exposing another customer's information.

## Assurance and supply chain

The CI design includes backend tests, frontend build checks, dependency audit, dependency review, CycloneDX SBOM generation, SBOM publication, provenance attestation, worker-image build, and high/critical vulnerability scanning. Production release processes should retain these artifacts with the release record and block promotion for unresolved critical findings or missing provenance.

The provider should maintain a vendor and subprocessor inventory, review provider security posture, maintain contracts and data-processing terms, track service dependencies, and test vendor failure scenarios. This whitepaper does not represent that Atom currently holds a SOC 2 report; customers should request the current assurance package from the service provider.

## Customer responsibilities

Customers are responsible for configuring their identity provider and target allowlists, approving sensitive runs, limiting test credentials, classifying data, protecting API credentials, reviewing audit activity, maintaining target-environment security, and notifying Atom of changes that affect integration risk. Customers should use non-production data where possible and avoid placing secrets in prompts or generated test code.

## Security claims and assurance boundary

Atom should be described as having **SOC 2-oriented technical controls and readiness work in progress** unless and until an independent CPA firm issues an applicable report. Availability, confidentiality, processing integrity, privacy, and security commitments depend on the selected service scope, production configuration, operating procedures, third-party services, and the executed customer agreement.

## Customer security contact

The service provider should publish a security contact, vulnerability-reporting process, subprocessor list, privacy notice, data-processing agreement, retention schedule, and current assurance reports before making this whitepaper a customer-facing commitment.
