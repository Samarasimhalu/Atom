# Atom Disaster Recovery Plan

**Owner:** Platform SRE
**Review cadence:** Quarterly and after every recovery exercise
**Targets:** RTO [4 hours], RPO [1 hour] — final values require executive approval

## Activation criteria

Activate this plan for loss of the primary region, unrecoverable PostgreSQL corruption, prolonged Redis failure, object-storage unavailability, worker-image compromise, or any incident where the control plane cannot preserve tenant isolation or run integrity.

## Command structure

The incident commander owns the decision to activate recovery. Platform SRE restores infrastructure. Security owns containment, credentials, evidence preservation, and control validation. Customer Operations owns customer updates. Product Engineering validates run state, event sequence, artifacts, approvals, and quota reconciliation.

## Recovery sequence

1. Freeze new execution by setting the execution feature flag to disabled and block new submissions at the edge.
2. Preserve logs, audit events, queue state, database snapshots, deployment manifests, and the incident timeline.
3. Determine the last known-good PostgreSQL point, Redis recovery point, object-storage version set, and approved API/worker image digests.
4. Provision an isolated recovery environment with private networking, managed secrets, TLS, identity-provider configuration, and production policy versions.
5. Restore PostgreSQL into the recovery environment and verify schema version, run counts, event sequence, audit records, approval records, artifacts metadata, and tenant boundaries.
6. Restore or validate object-storage versions and checksums for a representative artifact sample. Do not make the bucket public.
7. Restore Redis according to its approved persistence strategy. Reconcile queued jobs against durable run states and quarantine jobs with unknown or terminal state.
8. Deploy the approved API and worker images. Run readiness, authentication, RBAC, policy, idempotency, event replay, cancellation, artifact authorization, and webhook signature smoke tests.
9. Reconcile database runs, queue jobs, terminal events, artifact metadata, quotas, and audit entries. Ticket every mismatch.
10. Obtain security and incident-commander sign-off, then reopen read-only traffic followed by controlled execution for an allowlisted tenant.
11. Monitor recovery SLOs and error budget for the approved observation period before general traffic restoration.

## Evidence and exit criteria

Record activation time, recovery point, restore completion time, recovered records, missing or divergent data, test results, approval decisions, customer updates, and corrective actions. Recovery is complete only when tenant isolation, authentication, policy, audit, run integrity, event replay, artifact authorization, and customer communication controls have passed.

## Exercise requirements

Run an isolated database/object-storage restore at least quarterly and a full regional or service-failure exercise at least annually. Exercises must not alter the primary production environment. Each exercise produces an evidence record using `compliance/SECURITY_OPERATIONS_TEMPLATES.md` and creates owners and due dates for every finding.
