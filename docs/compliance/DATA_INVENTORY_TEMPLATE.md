# Data Inventory Template

Maintain one reviewed row for each production data flow. This inventory is the source of truth for retention, deletion, export, vendor review, privacy notices, and backup scope.

| Data class | Example records | System of record | Tenant-scoped | Classification | Retention | Deletion/export path | Backup handling | Access roles | Vendor/data region | Owner | Last reviewed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Customer prompts and generated specifications | Prompts, structured test specs, generated code | PostgreSQL/object storage | Yes | Customer confidential | Contract/policy value | Authorized tenant export/deletion job | Backup-expiry reference | Developer, admin | Complete from vendor register | Product/Privacy | YYYY-MM-DD |
| Run metadata and lifecycle events | Run state, event sequence, idempotency data | PostgreSQL | Yes | Confidential operational | Contract/policy value | Authorized tenant export/deletion job | Backup-expiry reference | Viewer and above | Complete from vendor register | Engineering | YYYY-MM-DD |
| Execution artifacts | Screenshots, videos, traces, reports | Private object storage | Yes | Customer confidential | Artifact retention policy | Artifact authorization and tenant deletion job | Backup-expiry reference | Artifacts-read and above | Complete from vendor register | Engineering | YYYY-MM-DD |
| Audit records | Authentication, approvals, exports, policy events | PostgreSQL | Yes | Restricted operational | Compliance retention policy | Authorized export and legal-hold process | Backup-expiry reference | Audit-read and above | Complete from vendor register | Security | YYYY-MM-DD |
| Identity claims | Subject ID, tenant ID, role/group mapping | Identity provider and API memory | Yes | Restricted | Identity-provider policy | Identity-provider deletion/provisioning process | Provider reference | Identity administrators | Complete from vendor register | IAM | YYYY-MM-DD |
| Support and incident data | Tickets, notices, incident evidence | Support/incident system | As applicable | Restricted | Support/incident policy | Support privacy workflow | Backup-expiry reference | Support/Security | Complete from vendor register | Support | YYYY-MM-DD |

## Review Requirements

The Privacy/Legal owner and Engineering owner must review this inventory at least annually and after a material architecture, vendor, region, model-provider, retention, or customer-contract change. Any legal hold, deletion failure, or data-flow exception must link to a time-bounded security or privacy exception record.
