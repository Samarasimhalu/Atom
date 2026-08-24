# Atom Enterprise Service Level Agreement

**Draft — for legal, commercial, security, and customer review before execution**
**Version:** 1.0

## 1. Purpose and scope

This Service Level Agreement (the **“SLA”**) applies to the Atom enterprise services identified in the applicable order form (the **“Services”**). It defines service availability, support commitments, security incident communications, maintenance, recovery objectives, service credits, and the parties' operational responsibilities.

The SLA does not itself grant rights to use any customer target environment, third-party AI provider, identity provider, cloud service, or customer data. Those matters are governed by the order form, terms of service, acceptable-use policy, data-processing agreement, privacy notice, and applicable security documentation.

## 2. Definitions

| Term | Definition |
|---|---|
| **Availability** | The percentage of a calendar month during which the production Atom control-plane API is available for authenticated, non-maintenance requests, measured at the provider edge |
| **Downtime** | A period during which the measured service is unavailable or returns provider-caused 5xx errors, subject to exclusions |
| **Service Credit** | The credit against a future invoice described in Section 8; it is the customer's exclusive financial remedy for an availability shortfall unless the agreement states otherwise |
| **Response time** | The time from a valid support request being received by the provider's support system until a qualified support engineer acknowledges it |
| **RTO** | Recovery Time Objective: the target time to restore the affected service after a declared disaster |
| **RPO** | Recovery Point Objective: the target maximum period of data that may be lost after a declared disaster |
| **Business day** | [Insert time zone and business-day definition] |

## 3. Availability commitment

Subject to the exclusions in Section 7, the provider will target **99.9% monthly Availability** for the production Atom control-plane API during each calendar month. This target covers authenticated API request handling, run submission, run-state retrieval, event replay, artifact authorization, and the operations dashboard when those functions are included in the customer's purchased plan.

The Availability commitment does not guarantee that a customer's target application, browser session, network path, identity provider, AI provider, Redis service, object-storage service, or customer-managed integration will be available. Test execution completion time depends on the target environment, worker capacity, browser behavior, customer configuration, queue depth, and third-party services.

Availability is calculated as:

> **Availability percentage = (total minutes in the month − qualifying Downtime minutes) ÷ total minutes in the month × 100**

The provider will retain the measurement data and make a monthly service report available upon reasonable customer request. The measurement source, sampling interval, error classification, and treatment of partial outages should be finalized before signature.

## 4. Support and response commitments

The provider will provide support through **[support portal/email/phone]** during **[coverage hours and time zone]**. The customer must provide an order number, affected tenant, timestamps, correlation IDs, run IDs, severity, business impact, and relevant diagnostic information when submitting a ticket.

| Severity | Description | Initial response target | Update target | Target mitigation/restoration |
|---|---|---:|---:|---:|
| P1 — Critical | Production service unavailable, material security incident, or widespread inability to submit or retrieve runs | 30 minutes, 24×7 | Every 60 minutes | [4 hours] |
| P2 — High | Significant degradation affecting a major workflow or customer group without a complete outage | 2 business hours | Daily or on material change | [1 business day] |
| P3 — Normal | Limited defect, intermittent issue, or degraded feature with workaround | 1 business day | Every 3 business days | [5 business days or planned release] |
| P4 — Informational | Question, documentation request, feature request, or non-urgent issue | 2 business days | As agreed | Planned or informational response |

Response and restoration targets are targets, not guarantees, unless expressly marked as binding in the order form. The provider may reclassify a ticket after reviewing impact and evidence, with an explanation to the customer.

## 5. Security incidents

The provider will maintain an incident-response process and will notify the customer's designated security contact without undue delay after confirming a security incident affecting the customer's customer data. The notification will include, to the extent known, the nature of the incident, affected Services, likely data categories, containment actions, customer actions, and a contact for follow-up.

The provider will provide material updates as information becomes available and will cooperate reasonably with the customer's investigation, subject to confidentiality, legal, security, and other-customer protections. The provider will not disclose another customer's information or provide unrestricted access to internal systems.

Incident-notification timing, regulatory notice allocation, forensic cooperation, preservation obligations, and cost allocation should be aligned with the executed data-processing agreement and applicable law.

## 6. Business continuity, backup, and recovery

The provider will maintain business-continuity and disaster-recovery procedures appropriate to the Services. The production design targets **RTO [4 hours]** and **RPO [1 hour]** for the control-plane metadata service, subject to the selected hosting architecture and approved recovery plan. Artifact recovery targets may differ and should be specified in the order form if artifacts are business-critical.

The provider will maintain encrypted backups, access controls, retention schedules, and periodic restoration tests. A restoration test is not a guarantee that every customer target environment or third-party integration can be restored. The customer remains responsible for retaining copies of customer-owned test specifications and any data it is required to retain independently.

## 7. Planned maintenance and exclusions

The provider may perform planned maintenance with at least **[7 days]** advance notice when reasonably practicable. Emergency maintenance may occur without advance notice when required to address a security, availability, or integrity risk. Maintenance notices will state the expected impact and, where available, the affected regions or features.

Downtime and support targets exclude: customer or third-party systems; identity-provider or network failures outside provider control; customer misconfiguration; target-application failures; customer-managed workers or integrations; suspension for non-payment or acceptable-use violations; force majeure; beta, preview, trial, or unsupported features; scheduled maintenance within the notice period; and events caused by the customer's breach of the agreement.

The provider should define whether queue delay, AI-provider unavailability, browser-target failures, artifact-storage failures, and partial regional impairment are measured as control-plane downtime, degraded service, or excluded dependency incidents.

## 8. Service credits

If the provider fails to meet the monthly Availability commitment, the customer may request a Service Credit by submitting a claim within **[30 days]** after the end of the affected month. The claim must identify the dates, timestamps, affected tenant, and relevant correlation IDs or ticket numbers.

| Monthly Availability | Suggested Service Credit |
|---:|---:|
| 99.9% or higher | 0% of the affected monthly subscription fee |
| 99.0% to below 99.9% | 10% |
| 95.0% to below 99.0% | 25% |
| Below 95.0% | 50% |

Service Credits are calculated against the affected Services' monthly subscription fee, are applied to a future invoice, are not refundable or transferable, and are subject to a monthly cap of **[50%]** unless the order form states otherwise. Service Credits are unavailable where an exclusion applies or where the customer has not paid undisputed invoices. The parties should confirm whether repeated or material failures create a termination right.

## 9. Customer responsibilities

The customer will maintain accurate contacts, protect credentials, configure approved identity-provider groups, review audit events, provide target-domain and egress information, use supported browsers and integrations, protect test credentials, classify and minimize submitted data, maintain customer-side backups where required, and cooperate with incident and recovery activities.

The customer will not use Atom to execute unauthorized tests, access systems without permission, bypass policy or approval controls, submit secrets unnecessarily, or place regulated data into AI prompts unless the parties have agreed the necessary data-processing and provider terms.

## 10. Security and assurance documentation

The provider will maintain the security documentation identified in the order form, which may include the Atom Security Whitepaper, subprocessor list, privacy notice, data-processing agreement, vulnerability-reporting process, and available independent assurance reports. The provider will not represent that the Services are SOC 2 certified or attested unless an applicable independent report has been issued and is current for the relevant scope and period.

Customer security questionnaires and audit requests will be handled under the provider's standard assurance process. On reasonable notice and subject to confidentiality and security restrictions, the provider may provide summaries of control operation, relevant audit reports, penetration-test summaries, vulnerability-management evidence, and backup/restore test evidence rather than unrestricted access to systems or other-customer data.

## 11. Changes and termination

The provider will provide notice of material changes to the Services or security architecture as required by the order form or applicable law. A material reduction in the security or availability commitments should trigger the review and termination rights specified in the commercial agreement.

Upon termination, the provider will make customer data and artifacts available for **[30 days]**, subject to the customer's payment obligations and technical export capabilities. After the export period, the provider will delete or render inaccessible customer data according to the retention schedule and data-processing agreement, except for legally required retention, security backups, and audit records that are retained under controlled access and deleted at the end of their applicable retention period.

## 12. Order of precedence and review

If this SLA conflicts with the order form, data-processing agreement, or master services agreement, the order of precedence should be stated explicitly in the executed contract. The parties should review the Availability measurement method, support coverage, service credits, RTO/RPO, security-incident notification period, data-export period, and dependency exclusions before signature.

**Provider approval:** ____________________  **Date:** __________
**Customer approval:** ____________________  **Date:** __________
