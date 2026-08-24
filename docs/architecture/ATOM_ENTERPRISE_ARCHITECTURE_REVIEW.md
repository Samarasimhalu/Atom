# Atom Enterprise Architecture Review

## Executive assessment

Atom is a promising **AI-assisted Playwright test-generation and execution prototype**, but it is not yet an enterprise product. The current implementation demonstrates the core user journey—describe a test, generate code, execute it, and stream results—but it is still a single-process, file-backed development application with no identity boundary, tenant isolation, durable job orchestration, controlled execution sandbox, or production-grade observability.

My overall assessment is **prototype / pre-MVP**, not “enterprise ready.” The largest risk is that the product executes AI-generated or user-supplied TypeScript through `npx` and installs dependencies at runtime. In the current design, an authenticated or unauthenticated caller could ultimately influence code and runtime behavior without a hardened isolation boundary. That issue should be treated as a release blocker before any shared environment or customer data is introduced.

| Dimension | Current assessment | Enterprise target |
|---|---:|---:|
| Product concept | Strong and differentiated | Preserve the AI-assisted testing workflow |
| Application architecture | Single Node.js process with local filesystem persistence | Stateless control plane plus durable execution workers |
| Identity and tenancy | Not implemented | SSO, SCIM, RBAC/ABAC, tenant isolation, audit trail |
| AI safety and governance | Basic prompt-to-code generation | Versioned models/prompts, structured outputs, policy checks, evaluation gates |
| Test execution security | High risk; runtime install and child-process execution | Ephemeral sandbox/worker with allowlists, quotas, egress controls, and teardown |
| Data durability | Local JSON/filesystem | Database plus object storage, retention, encryption, backup/restore |
| Reliability | In-memory queue and WebSocket state | Durable queue, retries, idempotency, reconnectable event stream |
| Delivery readiness | Build/lint and dependency baseline are failing | Reproducible CI/CD, SBOM/provenance, signed artifacts, automated testing |
| Enterprise UX | Good prototype surface | Workspaces, approvals, governance, integrations, reporting, admin console |

The recommendation is to **re-platform the execution and data boundaries before adding more AI features**. Enterprise buyers will value trustworthy, repeatable, secure execution more than a larger prompt library.

## Evidence observed in the repository

The review is based on the first-party source tree, package manifests, documentation, and local build checks. The repository contains a React/Vite frontend and an Express/WebSocket backend. The backend stores tests and results under local paths configured in `src/backend/config.js`, and the `TestManager` persists data using JSON/filesystem operations rather than a transactional database.

| Evidence | Architectural implication |
|---|---|
| `src/backend/server.js:22-45` enables broad CORS, large JSON bodies, and publicly served artifact directories | No production identity, authorization, tenant boundary, or controlled artifact access is present |
| `src/backend/server.js:63-216` exposes generation, execution, test, result, and analytics routes without authentication middleware | Any deployed endpoint would be a direct control-plane surface |
| `src/backend/mcpExecutor.js:88-114` writes generated code and a package manifest into an execution directory | User/AI-produced code becomes executable workload input |
| `src/backend/mcpExecutor.js:176-305` invokes `npx playwright test` and runs `npm install` during a request-driven workflow | Runtime dependency installation and child-process execution create supply-chain, escape, cost, and denial-of-service risks |
| `src/backend/config.js:29-35` uses relative local storage paths | Data is node-local, difficult to back up, and incompatible with horizontal scaling |
| `src/backend/streamingService.js` maintains connection and subscription state in memory | Reconnects, multiple replicas, and failover cannot reliably preserve execution events |
| `src/backend/aiTestGenerator.js:157-182` constructs free-form prompts and `src/backend/aiTestGenerator.js:267-276` performs simple code cleanup | Output is not schema-validated, policy-scanned, or deterministically transformed |
| `src/frontend/src/App.jsx:42-71` connects to `ws://localhost:3001` and `App.jsx:122-157` hard-codes localhost API URLs | The client is development-bound and lacks environment-aware secure transport/configuration |
| Root `npm test` is a placeholder and the frontend lint has an error in `vite.config.js` | Quality gates are not release-ready |
| `npm audit --omit=dev` reported 11 vulnerabilities: 3 moderate, 7 high, and 1 critical in the current installation | Dependency remediation and continuous scanning are required before production use |
| Frontend build failed because the installed Rollup optional native package is missing | The build is not currently reproducible on the connected macOS environment |

## Release-blocking issues

### 1. Unauthenticated control plane and absent tenant isolation

All major API routes are registered without authentication or authorization middleware. The application has no user, organization, workspace, project, role, or policy model. A production deployment would therefore have no reliable answer to “who may generate, execute, view, delete, or export this test?”

Implement an identity boundary first. Use OIDC/SAML SSO for workforce customers, short-lived sessions or JWTs with key rotation, SCIM for lifecycle management, and a resource hierarchy of organization → workspace → project → test/run/artifact. Enforce authorization in the service layer, not only in the frontend. Every read and write must carry a tenant context derived from the authenticated principal, never from a client-supplied `tenantId`.

### 2. Arbitrary code execution and unsafe runtime dependency installation

The execution path writes `testData.code` to disk and launches Playwright with a child process. It also performs `npm install` inside the generated execution directory. This is not an acceptable trust boundary for a multi-tenant service. Generated code can contain network calls, filesystem access, environment-variable reads, subprocess creation, or dependency manipulation. Even if the model is trusted, prompts and test specifications are untrusted input.

Move execution into isolated, ephemeral workers. A practical first target is a locked-down container or microVM per run with a read-only base image, non-root user, seccomp/AppArmor profile, CPU/memory/process/file-size limits, short hard deadlines, restricted filesystem mounts, and a default-deny egress policy. Do not install arbitrary packages during a run. Build and scan approved browser/runtime images ahead of time, pin dependencies by lockfile and digest, and maintain a signed allowlist of test capabilities. Treat browser credentials and environment variables as scoped secrets injected by a secret broker, never copied into generated code or logs.

### 3. Public artifact exposure

The backend serves screenshots, videos, traces, and reports directly from filesystem directories. These assets can contain credentials, personal data, payment information, internal URLs, and full browser traces. They must not be exposed through predictable public paths.

Store artifacts in private object storage. Issue short-lived, tenant-scoped signed URLs after authorization, or proxy downloads through an authorization-aware artifact service. Add malware/content checks where uploads are accepted, redact secrets and sensitive fields from logs and artifacts, define retention classes, and support legal hold/deletion workflows.

### 4. In-memory queue and execution state

`MCPExecutor` maintains its queue and active execution map in process memory. A restart loses queued work and status, and a second replica has no shared view. The current WebSocket service has the same limitation for connections and subscriptions.

Introduce a durable job system. The API should create an idempotent run record and enqueue a job; workers should claim jobs with leases, renew leases while running, emit events to a durable event stream, and persist terminal state. A reconnecting client should reconstruct the run timeline from the server rather than relying on an uninterrupted WebSocket session. WebSockets can remain for low-latency notifications, but Server-Sent Events or a durable event API should provide recovery semantics.

### 5. AI output is not governed as executable software

The model response is cleaned with regular expressions and then used as test code. There is no structured output contract, compiler/type check, policy scan, test review workflow, model/version capture, prompt versioning, or evaluation suite. The fallback generator also includes hard-coded example credentials and public URLs, which is unsafe as a production pattern.

Use a typed intermediate representation first: test intent, target, actions, assertions, data policy, required capabilities, and expected risk. Generate code from the validated representation using deterministic templates. If direct code generation is retained, require JSON-schema output, parse and validate it, compile in a disposable environment, scan for forbidden APIs and domains, and require human approval for high-risk actions. Record model ID, provider, prompt-template version, policy version, input classification, output hash, and reviewer decision for every generation.

## Target enterprise architecture

The recommended target is a **control plane / execution plane split**. The control plane is responsible for identity, projects, test definitions, generation requests, approvals, scheduling, policy, billing/quotas, run metadata, and reporting. The execution plane is responsible for isolated browser/test workers and artifact collection. No API request should directly own a long-running browser process.

```text
User / CI / API client
          |
          v
API Gateway / WAF / Rate limits
          |
          v
Control Plane
  - OIDC/SAML, SCIM
  - tenant/workspace/project authorization
  - test catalog and versioning
  - AI gateway and policy engine
  - run API and idempotency
  - audit service
          |
          +--> PostgreSQL: metadata, RBAC, runs, policies, audit index
          +--> Object storage: code, screenshots, video, traces, reports
          +--> Durable queue/event bus: run jobs and run events
          |
          v
Execution Orchestrator
          |
          v
Ephemeral isolated workers
  - pinned Playwright image
  - no runtime npm install
  - capability/egress allowlists
  - resource/time quotas
  - secret broker injection
          |
          v
Artifact scanner/redactor --> private object storage --> signed download URLs

Observability: OpenTelemetry traces, metrics, structured logs, SIEM export
```

A relational database should become the system of record for metadata. Suggested core entities are `Organization`, `Workspace`, `Project`, `User`, `RoleBinding`, `Environment`, `TestDefinition`, `TestVersion`, `GenerationRequest`, `Run`, `RunAttempt`, `Artifact`, `Policy`, `Approval`, `Integration`, `SecretReference`, and `AuditEvent`. Test code and binary artifacts should remain in versioned object storage, referenced by immutable content hashes.

## Prioritized change portfolio

| Priority | Change | Why it matters | Acceptance criteria |
|---|---|---|---|
| P0 | Add OIDC/SAML authentication and tenant-aware authorization | Prevents unauthorized access and establishes the enterprise security boundary | Every API and WebSocket connection has an authenticated principal; authorization tests cover cross-tenant access |
| P0 | Isolate execution in ephemeral workers | Reduces the highest-impact code execution and data exfiltration risk | No API process launches customer code; workers are non-root, resource-limited, network-restricted, and destroyed after each run |
| P0 | Remove runtime `npm install` | Eliminates unpinned dependency installation and reduces supply-chain risk | All execution images are built in CI from lockfiles and approved image digests |
| P0 | Replace public filesystem artifact serving | Protects screenshots, traces, videos, and reports | Artifacts are private, encrypted, tenant-scoped, retained by policy, and downloaded only through authorized signed URLs |
| P0 | Add durable runs and queueing | Prevents lost jobs and enables horizontal scaling | Restart and worker failure tests demonstrate recovery without duplicate terminal outcomes |
| P0 | Establish CI quality gates | Makes releases repeatable and auditable | Build, lint, unit, integration, security, dependency, and smoke tests are required checks |
| P1 | Introduce PostgreSQL and object storage | Enables durable multi-tenant data and reliable reporting | No business-critical data is stored only in local JSON/filesystem state |
| P1 | Build an AI gateway and policy engine | Centralizes model routing, privacy controls, quotas, and safety | Model/prompt/policy versions are recorded; sensitive prompts are redacted or routed according to policy |
| P1 | Add structured generation and code validation | Improves determinism, reviewability, and safety | Invalid schema, compiler errors, forbidden APIs, and disallowed domains block execution |
| P1 | Implement audit logs and admin governance | Required for incident response and enterprise accountability | Immutable audit events cover authentication, generation, approvals, execution, exports, and policy changes |
| P1 | Add observability and SLOs | Enables production operations | Metrics, traces, logs, correlation IDs, dashboards, alerts, and run-level diagnostics are available |
| P1 | Add quotas, rate limits, and cancellation | Controls cost and denial-of-service risk | Limits exist per organization, user, project, model, and run; cancellation reaches workers promptly |
| P2 | Add CI/CD integrations and webhooks | Converts Atom from a demo into a delivery-system component | GitHub/GitLab/Azure DevOps integrations support least-privilege tokens and signed webhook validation |
| P2 | Add test versioning, approvals, environments, and schedules | Makes tests governable and reproducible | Every run identifies immutable test/environment/version inputs and approval status |
| P2 | Add enterprise reporting and integrations | Supports adoption, quality programs, and compliance evidence | Exportable reports, dashboards, SIEM integration, and ticketing links are supported |
| P2 | Add multi-region and disaster recovery design | Supports continuity requirements for larger customers | RPO/RTO are documented and tested; backups are encrypted and restore-verified |

## AI product changes

Atom should evolve from “prompt in, Playwright code out” into a governed **test engineering copilot**. The product should first elicit or infer a test specification, show the assumptions it made, identify missing environment details, and classify the requested action by risk. A generated test should be a versioned artifact with a diff, rationale, traceability to the user request, and an explicit approval state.

The AI gateway should support provider abstraction, model routing, budgets, regional/data-residency rules, timeout/retry policy, prompt-template versioning, and a no-training/data-processing policy per customer. Sensitive inputs should be classified before leaving the customer boundary. Enterprise customers should be able to select approved models, disable external providers, or use a private model endpoint.

Use an evaluation program rather than relying on subjective demos. Maintain a golden set of prompts covering authentication, payments, uploads, PII, accessibility, flaky selectors, cross-browser behavior, malicious instructions, and ambiguous requirements. Measure compile success, execution success, assertion quality, false-positive rate, repair rate, latency, cost, and unsafe-output block rate. NIST’s AI Risk Management Framework recommends managing AI risks through the complementary functions **Govern, Map, Measure, and Manage**; Atom should map each function to product controls and release evidence.[1]

Prompt injection, insecure output handling, sensitive information disclosure, excessive agency, model denial of service, and supply-chain vulnerabilities are directly relevant to Atom because it accepts natural-language instructions and turns outputs into executable workloads. These are recognized risks in OWASP’s LLM guidance.[2] The product should therefore treat prompts, generated code, tool calls, and test fixtures as separate trust domains.

## Security and compliance baseline

The minimum enterprise security baseline should include TLS everywhere, secure headers, strict CORS allowlists, request size limits by route, schema validation, rate limiting, CSRF protection where cookie sessions are used, secret management through a vault/KMS, encryption in transit and at rest, centralized vulnerability management, and an incident response runbook. Avoid returning raw `error.message` values to clients in production; return a stable error code and correlation ID while retaining detailed diagnostics in protected logs.

For compliance readiness, design evidence collection from the beginning. Maintain policies and records for access reviews, joiner/mover/leaver events, asset inventory, dependency scanning, vulnerability exceptions, backup restore tests, incident response exercises, data retention, deletion requests, subprocessors, and model/provider changes. SOC 2 readiness is a reasonable initial target; customers in regulated sectors may additionally require data residency, customer-managed keys, private networking, and contractual restrictions on model data use.

Supply-chain controls should include lockfiles committed and verified, dependency scanning, provenance/SBOM generation, signed container images, base-image patching, protected branches, mandatory reviews, secret scanning, and reproducible CI builds. SLSA provides a useful framework for improving artifact integrity and provenance across the software supply chain.[3]

## Reliability and operability requirements

Define service-level objectives before scaling. A reasonable initial set is 99.9% monthly availability for the control plane, 99.5% successful job acceptance, 99% event delivery within five seconds for connected clients, and a documented run-completion durability objective. Separate control-plane availability from worker capacity so a temporary browser-grid shortage does not make the application appear down.

Every request, generation, run, worker attempt, and artifact should carry a correlation ID. Emit structured logs rather than console strings, and capture metrics for queue depth, job age, run duration, worker utilization, browser launch failures, artifact volume, model latency, token/cost usage, policy blocks, and flaky-test signals. Use distributed tracing across API, AI gateway, queue, worker, and artifact pipeline. Alert on error-budget burn, stuck leases, queue age, repeated worker crashes, storage failures, and suspicious egress.

The run lifecycle should be explicit: `requested → validated → approved → queued → assigned → running → collecting_artifacts → passed/failed/cancelled/timed_out → retained/deleted`. State transitions must be idempotent and append an audit event. A client reconnect must be able to query the current state and replay events from a sequence number.

## Product and enterprise UX priorities

The current single-screen assistant is a strong demo, but enterprise users need a workspace-oriented product. Add a project selector, environment profiles, test catalog, test version history, approvals, run history, filters, ownership, tags, secrets references, and role-aware administration. Make the generated test explainable: show the original intent, assumptions, target environment, selected model, generated diff, risks, and evidence from execution.

The highest-value enterprise workflows are likely to be: creating a test from a ticket or requirement, reviewing and approving AI-generated changes, running approved tests in CI, triaging failures with evidence, and exporting quality/compliance reports. Build those workflows before adding a broad plugin marketplace. Integrations should use scoped credentials, explicit consent, signed webhooks, and a clear audit trail.

## 90-day implementation roadmap

| Period | Outcome | Main work |
|---|---|---|
| Days 0–30 | Safe internal alpha | Add authentication, tenant context, schema validation, secure headers, rate limits, structured logging, correlation IDs, and a hard deny on unsafe execution. Remove runtime package installation and move runs to a single hardened worker image. Fix build/lint failures and replace placeholder tests with unit/integration smoke tests. |
| Days 31–60 | Durable private beta | Introduce PostgreSQL, object storage, durable queue, run state machine, idempotency keys, artifact authorization, retention policies, and reconnectable event delivery. Add OIDC/SAML foundation, RBAC, audit events, quotas, cancellation, and basic dashboards. |
| Days 61–90 | Enterprise pilot | Add AI gateway, structured test specification, policy engine, approval workflow, evaluation harness, CI integration, signed webhooks, SBOM/provenance, backup/restore tests, incident runbooks, and customer-facing security documentation. |

The first milestone should have an explicit go/no-go gate: **no shared customer environment until the P0 controls are implemented and validated by adversarial testing**. This includes cross-tenant authorization tests, prompt-injection tests, unsafe-code tests, egress tests, worker escape tests, artifact access tests, dependency compromise simulations, queue recovery tests, and restore tests.

## Suggested initial backlog

Create separate workstreams with clear owners. The platform workstream should deliver identity, tenancy, database, object storage, queues, and auditability. The execution-security workstream should deliver worker isolation, image hardening, capability policies, secret injection, quotas, and artifact scanning. The AI governance workstream should deliver the schema, model gateway, evaluation harness, prompt/version registry, safety policies, and approval workflow. The developer-experience workstream should deliver CI/CD integration, run APIs, webhooks, SDKs, and reproducible local development. The product workstream should deliver workspaces, test catalog, approvals, run history, triage, and enterprise reporting.

Each backlog item should include a threat model, API contract, migration plan, telemetry, negative tests, and operational runbook. Avoid marking a feature complete when only the happy-path UI works; enterprise readiness requires failure behavior, authorization behavior, data lifecycle behavior, and evidence.

## Final recommendation

Atom has a credible product direction and a useful prototype foundation. The recommended path is not to discard the existing user experience, but to **replace the trust, persistence, and execution foundations underneath it**. The critical architectural decision is to make generated tests a controlled, versioned workload executed by isolated workers—not arbitrary code launched by the web server.

If the P0 controls are implemented first, Atom can become an enterprise-grade AI test engineering platform with a differentiated workflow: governed test generation, secure execution, durable evidence, and CI-native quality intelligence. If feature expansion proceeds without those controls, the product will accumulate architectural debt and expose customers to unacceptable security, privacy, cost, and reliability risks.

## References

[1]: https://www.nist.gov/itl/ai-risk-management-framework "NIST AI Risk Management Framework"

[2]: https://owasp.org/www-project-top-10-for-large-language-model-applications/ "OWASP Top 10 for Large Language Model Applications"

[3]: https://slsa.dev/ "SLSA: Safeguarding artifact integrity across any software supply chain"

## Appendix: validation commands and results

The following checks were run against the repository during this review:

| Check | Result |
|---|---|
| `npm audit --omit=dev` | Reported 11 vulnerabilities: 3 moderate, 7 high, 1 critical |
| `npm run build` | Failed because Rollup could not load the platform-specific optional package `@rollup/rollup-darwin-arm64` in the existing install |
| `cd src/frontend && npm run lint` | Failed on `vite.config.js:11:25` because `__dirname` is undefined; six Fast Refresh warnings were also reported |
| `npm test` | Placeholder command exits with `Error: no test specified` |
| `git status --short` | Existing working-tree changes include `.DS_Store` modification and deletion of `asset/Atom Logo.png`; these should be reviewed before release |

This review intentionally assesses architecture and release readiness; it does not claim that every runtime path was exercised against a deployed environment.
