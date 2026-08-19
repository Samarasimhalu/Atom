# Atom Production Observability Contract

## Required signals

The production deployment must emit metrics, structured logs, traces, and audit events for API requests, authentication, tenant denials, authorization changes, policy decisions, AI provider calls, run state transitions, queue jobs, worker lifecycle, artifacts, webhooks, backups, database health, Redis health, and object-storage errors.

Every signal must include a correlation ID. Run and audit signals must also include tenant ID, run ID where applicable, actor ID where appropriate, release SHA, environment, and service version. Customer content and secrets must not be written to logs.

## SLO starting point

| Service indicator | Target | Alert threshold | Owner |
|---|---:|---:|---|
| Control-plane availability | 99.9% monthly | below 99.95% burn-rate | Platform SRE |
| Non-execution API p95 | below 500 ms | above 750 ms for 10 minutes | Platform SRE |
| Oldest queued run | below 300 s | above 300 s | Platform SRE |
| Worker startup failure | below 2% | above 2% over 10 minutes | Platform SRE |
| Artifact upload 5xx | below 0.5% | above 1% over 5 minutes | Platform SRE |
| Audit-write failure | 0 | any occurrence | Security Operations |
| Backup age | below 24 h | above 24 h | Platform SRE |
| Webhook delivery failure | below 1% | above 5% over 10 minutes | Product Engineering |

## Evidence requirements

The monitoring platform must retain raw metrics, alert state, alert acknowledgements, incident tickets, and monthly SLO reports for the approved evidence-retention period. Security Operations reviews alert coverage monthly. Platform SRE reviews capacity and error budgets monthly. Management reviews availability, incidents, vulnerabilities, and recovery results quarterly.

Use `observability/alerts.yml` as the versioned alert catalog. Each alert must have one owner, one runbook, a severity, an escalation path, and a documented suppression process. Alert changes follow the same change-management controls as production code.
