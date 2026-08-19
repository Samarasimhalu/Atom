# Atom Security and Compliance Policy Set

**Status:** Draft for executive approval before production use
**Policy owner:** Security and Compliance
**Review cadence:** At least annually and after material change

## Information security and acceptable use

Atom protects customer information, credentials, execution targets, infrastructure, and service code using least privilege, tenant isolation, controlled execution, approved providers, and documented incident response. Personnel must use company systems only for authorized work, must not bypass controls, and must report suspected security events promptly.

## Access control

Production access requires an approved business purpose, enterprise identity, MFA, least privilege, and time-bounded elevation where practical. Access is reviewed quarterly and on role change or termination. Shared accounts are prohibited except for documented service identities. Break-glass access is logged, approved, time-bounded, and reviewed after use.

## Change management

Production changes require a linked change record, peer review, required automated checks, security review for sensitive paths, deployment approval, rollback plan, and release evidence. Emergency changes are limited to urgent risk reduction and receive retrospective review within one business day.

## Vulnerability management

Dependencies, source, container images, and deployed artifacts are scanned continuously or at the defined release cadence. Critical vulnerabilities target remediation within 7 days, high within 30 days, medium within 90 days, and low according to risk. Exceptions require compensating controls, an owner, an expiry date, and security approval.

## Incident response

Security and availability incidents are classified, contained, investigated, communicated, recovered, and reviewed. Evidence is preserved. Customer notifications follow the executed agreement and applicable law. Every material incident produces corrective actions and a regression test or control change.

## Business continuity and recovery

Production data is backed up, access-controlled, encrypted, and restored in an isolated environment on a scheduled basis. Recovery objectives are approved by management and tested at least quarterly. Restore failures create incidents and corrective-action tickets.

## Vendor, AI-provider, and privacy governance

Critical vendors and subprocessors are inventoried and reviewed before use and periodically thereafter. AI providers require approved model, region, retention, data-use, and subprocessor settings. Customer data is inventoried, classified, retained only for approved purposes, and deleted or exported through authorized workflows.

## AI governance and execution safety

AI requests pass through the governed gateway. Models, budgets, redaction, evaluation datasets, policy thresholds, and approval requirements are controlled changes. Test execution requires an immutable, scanned worker image, approved target scope, and policy authorization. Unsafe execution is denied by default.

## Policy approval record

| Policy | Approver | Approval date | Next review | Version |
|---|---|---:|---:|---:|
| Information security and acceptable use | [Executive sponsor] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Access control | [Security owner] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Change management | [Engineering owner] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Vulnerability management | [Security owner] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Incident response | [Incident commander] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Business continuity | [Executive sponsor] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| Vendor and privacy | [Privacy/legal] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
| AI governance | [AI governance owner] | [YYYY-MM-DD] | [YYYY-MM-DD] | 1.0 |
