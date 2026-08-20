# Dynamic API Parameter Chaining

## Purpose

Atom supports a declarative API test plan in which a response value extracted from an earlier request can be passed to a later request. This enables workflows such as creating an order, extracting its identifier, retrieving it, and validating its terminal state.

> **Security boundary:** A chain is structured data, not executable JavaScript. Atom does not execute Postman scripts, `eval`, arbitrary shell commands, or user-defined callbacks as part of parameter chaining.

## Plan contract

The supported plan version is `api-test-plan/v1`. A plan contains ordered request steps. Each extraction declares a variable name and a restricted JSONPath (`$`, simple object properties, and numeric array indices). Later steps may reference only variables extracted by an earlier successful step using `{{chain.variableName}}`.

```yaml
kind: api-test-plan/v1
name: order lifecycle
environment: payments-staging
contractVersion: sha256:example
steps:
  - id: create-order
    request:
      method: POST
      path: /v1/orders
      body:
        sku: sku-1
        quantity: 1
    assertions:
      - type: status
        equals: 201
    extract:
      - name: orderId
        source: body
        path: $.id
        classification: secret
  - id: read-order
    request:
      method: GET
      path: /v1/orders/{{chain.orderId}}
    assertions:
      - type: status
        equals: [200, 304]
```

## Enforced controls

| Control | Enforcement |
|---|---|
| Ordering | A variable cannot be referenced before an earlier step successfully extracts it. |
| Mutation safety | A failed assertion stops the chain before extraction or dependent-request execution. |
| Expression safety | JSONPath is intentionally limited; prototype-related properties and arbitrary expression evaluation are rejected. |
| Request scope | Plans accept relative paths only, never absolute URLs. The registered environment and policy choose the actual destination. |
| Secret handling | Results report whether an extraction was present and its classification, but never return extracted values. |
| Bounded execution | Plans have limits on steps, assertions, extractions, variables, headers, timeout, and response handling. |
| Remote execution | API plans are denied unless execution is enabled and a managed egress proxy plus domain allowlist are configured. |
| Auditability | The canonical normalized plan is hashed; the run links the plan, environment, policy, approval, and evidence. |

## Supported assertion types

| Type | Purpose |
|---|---|
| `status` | Assert one or more allowed HTTP status codes. |
| `json_path_exists` | Assert that a restricted JSONPath is present or absent. |
| `json_path_equals` | Assert an exact JSON value at a restricted JSONPath. |
| `header_equals` | Assert an exact response-header value. |

## Release boundary

The plan evaluator is regression-tested using an injected request adapter. Actual remote API requests remain subject to Atom’s remote-egress release gate. No control-plane process directly sends requests to imported API endpoints. The production API runner must use a proxy-only egress boundary, tenant-scoped environment registry, secret broker, runtime DNS and redirect validation, method/data policy, byte quotas, and audit telemetry before remote API testing is enabled.
