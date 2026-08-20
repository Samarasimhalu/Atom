# Remote-Target Execution Release Gate

**Status:** Blocking for remote-target execution. This document does not block deployment of Atom with `EXECUTION_ENABLED=false` or with isolated worker execution that has no network access.

## Current Safe Posture

Atom workers run with Docker network access disabled (`--network=none`), a read-only root filesystem, dropped capabilities, no-new-privileges, PID, memory, CPU, and temporary-filesystem limits. Each execution receives a run-specific results directory mounted at `/results`; it does not receive the shared results root.

This is an intentional fail-closed posture. It prevents a test from reaching a public application, API, private service, metadata endpoint, or arbitrary destination. Consequently, **remote-target testing is not a supported production capability in the current worker runtime**. Operators must keep `EXECUTION_ENABLED=false` unless using a pre-approved isolated workflow that does not require egress.

## Why Configuration Alone Is Insufficient

`WORKER_NETWORK_MODE` and `WORKER_EGRESS_PROXY_URL` are configuration inputs and production validation requires a proxy URL plus target allowlist whenever a non-`none` network mode is requested. The current Docker executor nevertheless hardcodes `--network=none`; it does not yet create a per-run network namespace, configure a proxy-only network path, or inject a proxy endpoint into the worker. Enabling a non-`none` mode must therefore remain prohibited until the runtime controls below are implemented and independently assessed.

> Do not remove `--network=none` as a workaround. A network-capable worker without a runtime destination boundary would invalidate Atom's target policy claims.

## Required Controls Before Enabling Remote Targets

| Control | Release requirement |
|---|---|
| Per-run network boundary | Create an ephemeral worker network or sandbox runtime for every run. The worker must have no direct external route. |
| Proxy-only egress | Attach the worker only to an authenticated egress proxy that denies direct DNS and direct IP egress. |
| Destination enforcement | Canonicalize URL, protocol, host, and port before queueing; re-resolve and revalidate DNS and redirects at the proxy for every connection. Deny loopback, unspecified, RFC 1918, link-local, multicast, IPv6 ULA/link-local, and cloud metadata ranges. |
| Allowlist and approval | Enforce tenant/project destination allowlists at the proxy. Require policy approval for production, destructive, or changed targets. Persist the policy version with the approval. |
| DNS and redirect logging | Record resolved address, destination, policy decision, redirect chain, and run/tenant correlation ID in tamper-evident audit logs. Do not record credentials or query secrets. |
| Artifact broker | Upload artifacts through a narrow broker or per-run scoped object-storage credential. The worker must not have tenant-wide object-storage credentials. |
| Artifact and output quotas | Enforce file-count, cumulative-byte, per-file-byte, allowed-media-type, archive-inspection, and stdout/stderr limits before copying or uploading. |
| Sandbox assurance | Use a hardened isolated worker host or a sandbox runtime such as gVisor or Kata Containers for any public-target execution. |
| Test evidence | Add integration tests for allowed targets, private-address denial, DNS rebinding, redirect-to-private denial, proxy bypass failure, result-quota enforcement, and cross-tenant artifact isolation. |

## Operational Decision

The current policy engine provides **pre-queue validation** for HTTP(S), domain allowlists, blocked domains, literal private IP addresses, credentials embedded in URLs, and maximum timeouts. It is not a substitute for runtime DNS, redirect, and proxy enforcement.

Until all required controls are deployed and evidenced, production operators must use one of the following modes:

1. Keep `EXECUTION_ENABLED=false` for an API-only deployment.
2. Execute only no-network worker jobs with `WORKER_NETWORK_MODE=none`.
3. Use a separately approved dedicated testing environment whose network boundary is implemented outside this repository and assessed as a compensating control.

No customer-facing claim should represent Atom as capable of secure public-target execution until this release gate is closed.
