# Security Operations Templates

## Vulnerability exception

```yaml
exception_id: VULN-YYYY-000
asset: atom-api-or-worker
finding: CVE-YYYY-NNNN
severity: high
source: dependency-or-image-scan
risk_owner: owner@example.com
compensating_controls:
  - control-description
remediation_plan: fix-pr-or-upgrade-plan
expires_at: YYYY-MM-DD
security_approval: reviewer@example.com
approved_at: YYYY-MM-DD
status: open
```

Critical findings target remediation within 7 days, high within 30 days, medium within 90 days, and low according to risk. Exceptions must expire and cannot be silently renewed.

## Vendor and subprocessor register

```yaml
vendor_id: V-000
name: provider-name
service: database-queue-ai-observability
criticality: critical
regions: [region]
data_categories: [run-metadata, artifacts, identity-claims]
access: read-write-or-no-access
contract_reference: contract-or-dpa-id
assurance_evidence: soc-report-or-security-review
incident_notice_terms: contract-section
business_continuity: exit-or-failover-plan
owner: vendor-owner@example.com
last_reviewed: YYYY-MM-DD
next_review: YYYY-MM-DD
status: approved
```

Critical vendors require review before production use and at least annually thereafter. Material changes in provider region, data use, subprocessor, security posture, or availability require an event-triggered review.

## Incident exercise record

```yaml
exercise_id: IR-YYYY-000
scenario: worker-compromise-or-database-recovery
facilitator: security@example.com
participants: [name-or-role]
started_at: YYYY-MM-DDTHH:MM:SSZ
ended_at: YYYY-MM-DDTHH:MM:SSZ
objectives:
  - freeze-new-execution
  - preserve-evidence
  - rotate-credentials
  - restore-or-recover
  - communicate-with-customers
results: pass-with-actions
observations: []
actions:
  - id: ACT-000
    owner: owner@example.com
    due: YYYY-MM-DD
    status: open
reviewed_by: executive-sponsor@example.com
reviewed_at: YYYY-MM-DD
```
