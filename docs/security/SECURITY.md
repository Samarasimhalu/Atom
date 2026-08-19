# Atom Security Overview

Atom is an AI-assisted testing platform designed around a separated control plane and execution plane. The control plane authenticates users, derives tenant context, validates requests, evaluates policy, records audit events, and queues work. The execution plane runs only prebuilt worker images with network restrictions, dropped capabilities, non-root execution, resource limits, and a hard timeout.

## Customer data and isolation

Tenant identity is derived from authenticated claims and is not accepted from request bodies. Run records, event streams, audit entries, and artifact metadata are tenant-scoped. Artifact objects are private; customers receive short-lived authorized download URLs rather than public filesystem paths. Object-storage encryption, provider lifecycle policies, backups, and retention periods are deployment-configured controls.

## AI governance

All provider calls pass through the AI gateway. The gateway enforces model allowlists, input and output budgets, timeouts, basic secret redaction, and structured request logging. Generated tests are normalized into a structured specification and evaluated by a deterministic policy engine before execution. Policies can block unsafe code and restricted target domains or require an approval workflow for production, payment, destructive, or otherwise sensitive tags.

Customers should avoid placing secrets, personal data, or regulated data in prompts unless an approved data-processing agreement and provider configuration are in place. Atom retains correlation IDs, model identifiers, policy decisions, and audit metadata according to the deployment's retention configuration.

## Identity and access

The platform supports signed JWT claim mapping and provides OIDC/SAML integration points. Production deployments should use an enterprise identity provider, enforce MFA through that provider, map groups to the least-privilege RBAC roles, and disable development authentication. Roles include viewer, developer, approver, admin, and owner.

## Availability and recovery

Runs are persisted in PostgreSQL, dispatched through Redis/BullMQ, and emit replayable sequence-numbered events. Customers can reconnect and resume event delivery from a known sequence. Operators should use managed database backups, point-in-time recovery, durable Redis configuration, versioned object storage, and the supplied backup/restore smoke test.

## Security evidence and reporting

Atom's CI pipeline produces dependency audit results, a CycloneDX SBOM, dependency-review results, container vulnerability scans, and build provenance attestations. Customers may request the relevant deployment evidence, security questionnaire responses, architecture diagrams, incident communications, and applicable penetration-test or compliance reports from the service operator.

## Shared responsibility

Atom provides the application controls described above. The deploying organization remains responsible for identity-provider configuration, network controls, target-environment access, secrets management, managed service configuration, backup retention, vulnerability response, customer data classification, and validating the worker image and policy configuration before enabling execution.

## Reporting a vulnerability

Do not disclose sensitive vulnerability details in public issue trackers. Report suspected security vulnerabilities through the service operator's designated security contact with the affected version, reproduction steps, impact assessment, and any relevant correlation IDs. Preserve evidence and avoid accessing data that does not belong to the reporting party.
