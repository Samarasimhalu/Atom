# Security Exception Record

Use one record for each time-bounded exception to a release, security, privacy, availability, or compliance control. Do not use this template to accept a P0 condition that exposes customer data or bypasses a mandatory production control.

```yaml
exception_id: SEC-YYYY-NNN
control_id: CC7.1
asset: atom-api-or-worker-image
release_commit: immutable-git-sha
finding: CVE-or-control-gap-summary
severity: high
source: CI-scan-penetration-test-audit-or-customer-report
risk_owner: accountable-person-or-role
business_justification: why-release-or-operation-cannot-wait
customer_impact: none-or-described-impact
compensating_controls:
  - concrete-control-and-verification
remediation_plan: pull-request-ticket-or-change-reference
opened_at: YYYY-MM-DDTHH:MM:SSZ
expires_at: YYYY-MM-DDTHH:MM:SSZ
security_approver: approving-person-or-role
executive_approver: required-for-critical-or-high-risk
approved_at: YYYY-MM-DDTHH:MM:SSZ
status: open
review_history: []
```

An exception must name one accountable owner, contain a testable compensating control, and expire. Renewal requires a new risk review and approval; it must never be silently extended. The release evidence bundle must link the exception to its CI run, affected image or package, and remediation ticket.
