# Atom Incident Runbooks

These runbooks provide the minimum response sequence for production incidents. The incident commander should record the incident ID, timeline, affected tenants, decisions, and customer communications in the incident system.

## Suspected unsafe execution or worker compromise

Immediately disable `EXECUTION_ENABLED`, stop the worker deployment, and revoke the worker image digest from the registry. Preserve API, queue, worker, and audit logs. Identify affected run IDs from `atom_runs` and isolate associated artifacts. Rotate worker registry credentials, webhook secrets, object-storage credentials, and any target-environment credentials that may have been exposed. Rebuild from a reviewed commit, run the SBOM and vulnerability scans, and deploy only a new immutable digest. Notify affected customers after scope is confirmed.

## AI provider outage or unsafe output

Switch generation to the fallback generator or disable AI generation through the feature flag. Preserve prompts, model identifiers, policy decisions, and correlation IDs for the affected requests. Run the evaluation harness against the current dataset before re-enabling the provider. If the issue involves prompt leakage or policy bypass, rotate provider credentials and review redaction and model allowlists before reopening traffic.

## Queue backlog or stuck runs

Check Redis health, queue depth, worker concurrency, and the oldest `queued` or `running` run. If the backlog is caused by a downstream target, pause new submissions and communicate the impact. Cancel poisoned jobs by run ID, do not delete run records, and preserve the sequence-numbered event history. Scale workers only after confirming the target and database can absorb the additional concurrency.

## PostgreSQL or object-storage recovery

Declare a recovery incident and stop writes if consistency is uncertain. Restore PostgreSQL to an isolated database using `scripts/backup-restore-smoke.sh`, verify the migration manifest and key tables, and compare the restored run/event counts with the backup report. Restore object storage using the provider's versioned recovery process and verify artifact metadata-to-object-key correspondence. Repoint the application only after smoke tests validate tenant isolation, idempotency, event replay, artifact authorization, and cancellation.

## Post-incident requirements

Complete a timeline, root-cause analysis, customer-impact assessment, control-gap review, and corrective-action list. Add a regression test for every escaped defect. Record whether credentials, tenant data, artifacts, prompts, or generated code crossed the intended trust boundary.
