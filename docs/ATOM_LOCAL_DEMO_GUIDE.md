# ATOM Local Demo Guide for Windows

This guide explains how to install and start ATOM on a Windows development machine, generate a test in the web UI, execute it in ATOM's isolated Playwright worker, and confirm the run in the dashboard. It is intended as both an operator checklist and source material for a demo-video outline.

This is a **local development demo**, not a production deployment. Use demo targets and non-sensitive prompts. Do not put API keys, passwords, customer data, or other secrets into prompts, source material, recordings, or NotebookLM.

## What the Demo Shows

ATOM accepts a natural-language test request, generates a test specification and code, applies request and policy checks, and can submit accepted code to a separate Playwright worker. The worker runs in a Docker container with security restrictions. ATOM records run states and displays tenant-scoped metrics in its operations dashboard.

The main flow is:

```text
Prompt in browser
  -> Express API validates and generates a test
  -> UI displays generated code for review
  -> Execute Test submits the generated test
  -> API applies execution and policy guardrails
  -> Run is recorded and queued
  -> Isolated Docker worker runs Playwright
  -> Result is stored and dashboard metrics update
```

Generating code and executing it are separate actions. A test run is not created by generation alone.

## Prerequisites

- Windows 10/11 with permission to install and run Docker Desktop.
- Node.js 20 LTS or 22 LTS, npm, and Corepack.
- Docker Desktop using Linux containers. CPU virtualization must be enabled in BIOS/UEFI for Docker's Linux worker.
- Internet access during dependency installation and the initial Docker image build.

If the machine is managed by an organization, ask its administrator before changing BIOS settings or installing Docker Desktop.

## Step 1: Install ATOM Dependencies

Open PowerShell in the repository root. Root/backend dependencies use npm; the frontend uses the pnpm version pinned in its package manifest.

```powershell
npm.cmd ci

Push-Location .\src\frontend
corepack.cmd pnpm install --frozen-lockfile
Pop-Location
```

Use `npm.cmd` in PowerShell to avoid a local execution-policy block on `npm.ps1`. Run Corepack from `src\frontend` so it sees the frontend's pinned pnpm version. Do not use `npm ci` inside `src\frontend`.

## Step 2: Confirm the Node Toolchain

Run these commands from the repository root:

```powershell
node.exe --version
npm.cmd --version

Push-Location .\src\frontend
corepack.cmd pnpm --version
Pop-Location

Test-Path .\node_modules
Test-Path .\src\frontend\node_modules
```

Both `Test-Path` commands should return `True`. Node.js 20 or 22 LTS is recommended. If the frontend lockfile install reports a different pnpm version than expected, confirm that the command was run from `src\frontend`.

## Step 3: Install Docker Desktop and Enable Virtualization

Docker Desktop is required for ATOM's isolated Playwright execution worker. If it is not installed, install it using your organization's approved method. On a personal machine with `winget`, the installer command is:

```powershell
winget install --id Docker.DockerDesktop -e
```

The installer may request administrator approval. After installation, reboot Windows if requested.

Check CPU virtualization from PowerShell:

```powershell
Get-CimInstance Win32_Processor |
  Format-List Name,VirtualizationFirmwareEnabled,VMMonitorModeExtensions,SecondLevelAddressTranslationExtensions
```

`VirtualizationFirmwareEnabled` must be `True`. If it is `False`, restart into BIOS/UEFI and enable the processor's virtualization setting. It is usually named **Intel Virtualization Technology**, **VT-x**, **VMX**, **SVM Mode**, or **AMD-V**. Save changes and restart Windows. Setting names and BIOS navigation vary by computer manufacturer.

Enabling CPU virtualization makes the capability available; it does not by itself run a virtual machine. Docker Desktop and its worker containers use system resources while active.

## Step 4: Start and Verify Docker, Then Build the Worker

Open Docker Desktop from the Windows Start menu and wait for it to report that its engine is running. If the `docker` command is not on PowerShell's PATH, add the usual Docker Desktop CLI directory for the current PowerShell window:

```powershell
$env:Path += ';C:\Program Files\Docker\Docker\resources\bin'
```

Confirm that Docker can reach its engine:

```powershell
docker version
docker info
```

`docker version` must display both a **Client** and a **Server** section. A client-only result means Docker Desktop's engine is not running yet. Resolve that before continuing.

From the repository root, build the local worker image:

```powershell
docker build --file workers/playwright/Dockerfile --tag atom-playwright-worker:local .
```

The first build downloads the pinned Playwright base image and worker dependencies and can take several minutes. Verify the resulting image:

```powershell
docker image inspect atom-playwright-worker:local
```

Do not enable ATOM execution until this build succeeds. If Docker cannot start because virtualization is unavailable, code generation can still be demonstrated, but local isolated execution cannot.

## Step 5: Start ATOM and Generate Test Code

In the PowerShell window that will run ATOM, set the local development environment. These values are inherited by both the backend and Vite frontend. The frontend identity variables are necessary for its authenticated API and dashboard requests.

```powershell
$env:NODE_ENV = 'development'
$env:AUTH_MODE = 'development'
$env:ALLOWED_ORIGINS = 'http://localhost:5173'
$env:PORT = '3001'

$env:VITE_API_BASE_URL = 'http://localhost:3001'
$env:VITE_DEV_USER = 'local-developer'
$env:VITE_DEV_TENANT_ID = 'local-tenant'

$env:EXECUTION_ENABLED = 'true'
$env:WORKER_MODE = 'isolated-image'
$env:WORKER_IMAGE = 'atom-playwright-worker:local'

# Optional: use a development provider key for provider-backed generation.
# Without it, ATOM uses its built-in fallback generator.
# $env:OPENAI_API_KEY = 'your-development-key'

npm.cmd run dev
```

Keep the terminal running. The command starts the Express API and Vite frontend together. Open these URLs:

| Purpose | URL |
|---|---|
| ATOM web application | `http://localhost:5173` |
| API health | `http://localhost:3001/api/health` |
| API readiness | `http://localhost:3001/api/readyz` |

Verify the API in another PowerShell window:

```powershell
Invoke-RestMethod 'http://localhost:3001/api/health'
Invoke-RestMethod 'http://localhost:3001/api/readyz'
```

In the UI, choose a test type, enter a low-risk prompt, and click **Generate Test**. Review the generated summary and code in the Code tab. Generation can use the configured OpenAI provider or the built-in fallback. The fallback is template-based, not a live AI response; its basic UI template targets `example.com`.

The generated test is held in the browser UI's current page state. The displayed code is for review; it is not a terminal command and is not automatically saved as a file for the user to run separately.

## Step 6: Execute the Generated Test and Review Its Result

With Docker running, the worker image built, and the execution environment set before ATOM starts, click **Execute Test** in the UI. The frontend submits the generated test to the backend. The backend checks the user's permission, tenant, request validity, idempotency key, execution configuration, test-code safety, and policy. If admitted, ATOM records and queues a run; the isolated worker then executes it.

Refresh the browser dashboard to see the run status. A run progresses through states such as `queued`, `assigned`, `running`, `collecting_artifacts`, and then `passed` or `failed`. The Results tab can show terminal status when run updates are received. WebSocket updates are disabled by default, so manual refresh may be needed to reconcile the final state.

An accepted run is counted even if the worker later reports failure. A request rejected before it is recorded is not counted. Generating code alone is never counted as an execution.

### Network Limitation for a Local Demo

The Playwright worker is launched with Docker networking disabled (`--network=none`). It cannot reach external websites or local services. A fallback-generated test that navigates to `example.com` is therefore expected to fail at navigation, even though the run should be recorded if it was admitted. Do not loosen worker network isolation as a quick demo fix. For an external target, execution requires a deliberately configured managed egress proxy and target allowlist; this guide does not configure those production-oriented controls.

The frontend currently displays generated code but does not provide an editor for modifying it before execution. Use prompts that lead to a suitable safe test, or use a separately reviewed test-generation setup. Do not claim a test passed unless the UI or run API actually reports `passed`.

## How Dashboard Metrics Are Produced

The UI requests `GET /api/dashboard`. The backend calculates metrics from stored runs belonging to the authenticated tenant; the dashboard does not read a frontend fixture JSON file.

With the default local persistence and no `DATABASE_URL`, run history is stored in `data/results/enterprise-store.json`. If `DATABASE_URL` is configured, the backend uses PostgreSQL instead. The repository's `data/results/results.json` is a separate legacy results file and is not the source of the dashboard metrics.

| Dashboard metric | What it counts |
|---|---|
| All runs | Up to the latest 500 runs for the current tenant, across run states. |
| Success rate | Passed runs divided by terminal runs. Terminal states are `passed`, `failed`, `cancelled`, and `timed_out`. |
| In flight | Runs in `requested`, `validated`, `queued`, `assigned`, `running`, or `collecting_artifacts`. |
| Average duration | Average recorded duration across terminal runs. A run without a duration contributes zero. |
| Recent runs | The 10 most recent runs for the current tenant. |

The tenant ID configured in `VITE_DEV_TENANT_ID` determines which tenant's data is shown. Runs created under a different tenant will not appear in that dashboard.

To inspect the dashboard response from PowerShell:

```powershell
$headers = @{
  'X-Dev-User' = 'local-developer'
  'X-Tenant-Id' = 'local-tenant'
}

Invoke-RestMethod 'http://localhost:3001/api/dashboard' -Headers $headers |
  ConvertTo-Json -Depth 8
```

## Troubleshooting

| Symptom | Meaning and next check |
|---|---|
| `npm` says scripts are disabled | In PowerShell, use `npm.cmd` rather than `npm`. |
| `pnpm` is not recognized | Run `corepack.cmd pnpm install --frozen-lockfile` from `src\frontend`; global Corepack shims are not required. |
| `docker` is not recognized | Check the CLI path. For this installation it is commonly `C:\Program Files\Docker\Docker\resources\bin`; add it to the current session's PATH as shown in Step 4. |
| Docker reports client but no server | Open Docker Desktop and wait for the engine to start. Check virtualization if Desktop reports that it is unavailable. |
| `unsafe_execution_denied` | Execution may be disabled, the worker image may be missing, or the code/policy may have triggered a guard. Inspect the `POST /api/execute/test` response in browser DevTools Network for its `reason`. Do not remove safety checks to force a run. |
| Run appears failed after navigation | The worker has no network in this profile. Use a test that does not depend on an external site, or configure managed egress through an approved deployment design. |
| Dashboard shows zero or another tenant's runs | Confirm the frontend's `VITE_DEV_TENANT_ID` matches the `X-Tenant-Id` used for the run, then refresh. |
| UI does not update to the final status | WebSockets are off by default. Refresh the dashboard to fetch the durable REST state. |

## Demo Video Outline

Use the following order for a short and accurate walkthrough:

1. **Show readiness:** briefly show Docker Desktop running, both Client and Server in `docker version`, and the successful worker image build. Avoid showing secrets or unrelated machine information.
2. **Start ATOM:** show the running `npm.cmd run dev` terminal and open the local UI.
3. **Generate:** select a test type, enter a low-risk prompt, click **Generate Test**, and pause on the summary and generated code.
4. **Explain the control point:** distinguish generated code from execution. Point out that execution is an explicit action and that backend guardrails run before a worker is admitted.
5. **Execute:** click **Execute Test** and show the run's state in the dashboard. Refresh if needed. State whether the result is passed or failed based on the UI/API, not on the fact that the button was clicked.
6. **Explain metrics:** show that accepted runs feed tenant-scoped dashboard metrics, while generation alone and rejected submissions do not.

If the generated test targets the public internet, explain that the default worker is network-isolated and do not present that run as a successful end-to-end website test. If no safe passing test is available on this machine, demonstrate generation and code review, then clearly label execution as unavailable or blocked rather than fabricating a result.

## Stopping the Local Demo

Press `Ctrl+C` in the terminal running `npm.cmd run dev`. Quit Docker Desktop when finished. The worker container is launched with `--rm`, so the per-run container is removed after execution. Local run history remains in the local persistence file unless it is deliberately cleaned up.