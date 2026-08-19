# Atom Incident Runbooks

These runbooks provide the minimum response sequence for production incidents. The incident commander should record the incident ID, timeline, affected tenants, decisions, and customer communications in the incident system.

## Credential or authentication incident

Contain the incident by disabling or restricting the affected identity, revoking active sessions and tokens where supported, and rotating exposed API, service, or webhook credentials. Preserve authentication logs, correlation IDs, affected tenant IDs, and identity-provider audit records. Determine whether the event indicates brute-force activity, credential theft, authorization bypass, or a provisioning failure; notify affected customers when required by the incident process.

## Audit-log integrity failure

Treat missing, malformed, delayed, or unauthorized audit records as a potential security incident. Preserve API, database, queue, and storage logs; stop any process that is overwriting or deleting evidence; and validate the audit event sequence against run, approval, artifact, and identity records. Escalate to security operations, identify affected tenants and the evidence gap, and document remediation before closing the incident.

## Execution compromise or unsafe worker

Immediately disable `EXECUTION_ENABLED`, stop the worker deployment, and revoke the worker image digest from the registry. Preserve API, queue, worker, and audit logs. Identify affected run IDs from `atom_runs` and isolate associated artifacts. Rotate worker registry credentials, webhook secrets, object-storage credentials, and any target-environment credentials that may have been exposed. Rebuild from a reviewed commit, run the SBOM and vulnerability scans, and deploy only a new immutable digest. Notify affected customers after scope is confirmed.

## AI provider incident

Switch generation to the fallback generator or disable AI generation through the feature flag. Preserve prompts, model identifiers, policy decisions, and correlation IDs for the affected requests. Run the evaluation harness against the current dataset before re-enabling the provider. If the issue involves prompt leakage or policy bypass, rotate provider credentials and review redaction and model allowlists before reopening traffic.

## Queue backlog or worker starvation

Check Redis health, queue depth, worker concurrency, and the oldest `queued` or `running` run. If the backlog is caused by a downstream target, pause new submissions and communicate the impact. Cancel poisoned jobs by run ID, do not delete run records, and preserve the sequence-numbered event history. Scale workers only after confirming the target and database can absorb the additional concurrency.

## Database or object-storage recovery

Declare a recovery incident and stop writes if consistency is uncertain. Restore PostgreSQL to an isolated database using `scripts/backup-restore-smoke.sh`, verify the migration manifest and key tables, and compare the restored run/event counts with the backup report. Restore object storage using the provider's versioned recovery process and verify artifact metadata-to-object-key correspondence. Repoint the application only after smoke tests validate tenant isolation, idempotency, event replay, artifact authorization, and cancellation.

## Post-incident requirements

Complete a timeline, root-cause analysis, customer-impact assessment, control-gap review, and corrective-action list. Add a regression test for every escaped defect. Record whether credentials, tenant data, artifacts, prompts, or generated code crossed the intended trust boundary.
