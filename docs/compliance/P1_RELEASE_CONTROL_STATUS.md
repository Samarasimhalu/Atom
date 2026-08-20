# P1 Release Control Status

**Purpose:** This register translates the SOC 2 P1 backlog into a release decision. It identifies controls that can be enforced by the repository and CI pipeline, and distinguishes them from controls that require customer contracts, approved personnel actions, production telemetry, or operating-period evidence.

## Release-Focused P1 Controls

| P1 item | Release status | Repository/CI evidence | Operating requirement before an audit claim |
|---|---|---|---|
| P1-01 Vulnerability and patch management | **Partially enforced** | Dependency audit, secret scanning, SBOM generation, dependency review, worker-image vulnerability scan, and a security exception template are version-controlled. | Assign owners and due dates to findings; conduct scheduled running-image drift scans; retain monthly aging and exception-review evidence. |
| P1-02 Vendor, AI-provider, and subprocessor governance | **Template-ready** | Vendor-register and customer-subprocessor templates define the minimum evidence fields. | Populate with actual vendors, contracts, DPAs, security evidence, regions, retention terms, exit plans, and annual/event-driven reviews. |
| P1-03 Privacy operations and data lifecycle | **Partially implemented** | Tenant export/deletion, artifact retention, and backup/restore smoke controls exist. A data-inventory template documents required records. | Confirm legal-hold process, backup expiry, deletion sign-off, privacy notice/DPA accuracy, and customer data-subject workflows. |
| P1-04 Processing integrity and evaluation | **Enforced for release** | Structured test specifications carry schema version `1.0`; state, idempotency, approval, policy, and evaluation regressions execute in CI. | Add incident-derived evaluation cases, production reconciliation reporting, and approval evidence for model/policy changes. |
| P1-05 Incident-response exercise program | **Template-ready** | Version-controlled incident runbooks and exercise-record template exist. | Run tabletop and technical exercises, create action tickets, and retain management review/sign-off. |
| P1-06 Access reviews and privileged operations | **Partially implemented** | Quarterly access-review evidence generator and role-based permissions exist. | Populate reviewed identity data, enact removals, introduce authoritative group/SCIM lifecycle and dual control for owner grants before claiming full enforcement. |
| P1-07 Deployment/runtime attestation | **Enforced when a manifest is supplied** | Release-manifest validator, SBOM/provenance artifacts, and restricted runtime-attestation API are present. | Require a signed manifest in every production deployment and monitor runtime drift from the approved manifest. |
| P1-08 Supportability and SLO evidence | **Defined, not yet evidenced** | Observability and SLO expectations are documented. | Deploy metrics, alert routes, synthetic probes, monthly availability reports, and corrective-action tracking. |

## Release Decision Rules

1. Atom may claim that the listed repository and CI safeguards are implemented only when the relevant required checks are passing on the release commit.
2. Atom must not claim SOC 2 Type II operating effectiveness until the operating requirements above have accumulated reviewed evidence over the defined audit period.
3. The remote-target execution gate remains independent and blocking: public-target execution must remain disabled until the controls in [`remote-egress-release-gate.md`](../security/remote-egress-release-gate.md) are satisfied.
4. A P1 exception requires an owner, compensating controls, an expiry date, and approval recorded with the release evidence.

## Required Release Evidence Bundle

A release approver should retain the following immutable references for every production release: commit SHA, CI run URL and conclusion, SBOM digest, worker image digest and vulnerability scan, release manifest, P0/P1 guard results, exception register, access-review evidence, and applicable approval records.
