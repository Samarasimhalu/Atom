# Atom Enterprise Foundation

Atom now has a durable execution foundation that separates the API control plane from queued execution. PostgreSQL is the source of truth for runs, state transitions, event history, audit records, artifact metadata, and quota usage. Redis/BullMQ is the durable dispatch layer when `REDIS_URL` is configured. S3-compatible storage is the production artifact backend when `S3_ENDPOINT` or a cloud region is configured; local object storage remains available for development and tests.

## Run lifecycle

A run follows the controlled state machine `requested → validated → queued → assigned → running → collecting_artifacts → passed|failed`. Cancellation is allowed from every non-terminal state. Each transition emits a sequence-numbered event persisted in `atom_run_events`. Clients can reconnect using `GET /api/runs/:id/events?after=<sequence>` and resume without losing events.

`Idempotency-Key` is required on execution submissions and is unique within a tenant. Repeated submissions return the original run instead of creating duplicate work. The queue uses the run ID as its stable job ID, so dispatch retries do not create duplicate jobs.

## Security and governance

OIDC and SAML settings are present in configuration as the integration foundation. The current request boundary accepts the existing signed JWT mode, while production identity adapters can map OIDC/SAML claims to `sub`, `tenant_id`, and `roles`. RBAC permissions include run creation, cancellation, approval, artifact access, audit access, dashboard access, and quota management.

All run and artifact routes are tenant-scoped. Artifact objects are private and are never exposed as public filesystem paths. Download requests first authorize the artifact metadata against the authenticated tenant, then return a short-lived signed URL or a local development route. Artifact records carry `retention_until`; an hourly process removes expired objects and tombstones their metadata.

## Local infrastructure

Start local services with:

```bash
npm run infra:up
export DATABASE_URL=postgres://atom:atom@localhost:5432/atom
export REDIS_URL=redis://localhost:6379
export S3_ENDPOINT=http://localhost:9000
export S3_ACCESS_KEY_ID=minioadmin
export S3_SECRET_ACCESS_KEY=minioadmin
npm run db:migrate
```

The local fallback remains available when these variables are absent, but it is not a production deployment mode. Production should use managed PostgreSQL with backups and point-in-time recovery, managed Redis with persistence and monitoring, and private object storage with server-side encryption and lifecycle policies.

## Operational endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/execute/test` | Idempotent, quota-checked run submission |
| `GET /api/runs` | Tenant-scoped run list |
| `GET /api/runs/:id` | Run state and result |
| `GET /api/runs/:id/events?after=N` | Replay events after sequence `N` |
| `POST /api/runs/:id/cancel` | Cancel queued or active work |
| `GET /api/artifacts/:id/download` | Authorized short-lived artifact URL |
| `GET /api/audit` | Tenant audit events for administrators |
| `GET /api/dashboard` | Tenant operational metrics and recent runs |

The initial frontend dashboard displays total runs, success rate, queued/running counts, failures, and recent execution records. It intentionally reports an authentication/configuration message when the API is unavailable rather than exposing unauthenticated data.
