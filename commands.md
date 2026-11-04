# ATOM Local Execution Commands

## Build and verify the Docker worker

Run these commands from the repository root in PowerShell:

```powershell
docker context ls
docker info
docker build --file workers/playwright/Dockerfile --tag atom-playwright-worker:local .
docker image inspect atom-playwright-worker:local
```

- `docker context ls` — Lists Docker contexts and shows which one is selected.
- `docker info` — Shows Docker engine details and verifies that the CLI can connect to it.
- `docker build --file workers/playwright/Dockerfile --tag atom-playwright-worker:local .` — Builds ATOM's Playwright worker image and tags it `atom-playwright-worker:local`.
- `docker image inspect atom-playwright-worker:local` — Displays details about the built worker image.

## Configure and start ATOM

Run these commands in the PowerShell window used to start ATOM:

```powershell
$env:EXECUTION_ENABLED = 'true'
$env:WORKER_MODE = 'isolated-image'
$env:WORKER_IMAGE = 'atom-playwright-worker:local'
$env:ENABLE_WEBSOCKETS = 'true'
$env:VITE_ENABLE_WEBSOCKETS = 'true'
npm.cmd run dev
```

- `$env:EXECUTION_ENABLED = 'true'` — Enables test execution in the backend.
- `$env:WORKER_MODE = 'isolated-image'` — Configures tests to run in an isolated Docker image.
- `$env:WORKER_IMAGE = 'atom-playwright-worker:local'` — Selects the local Playwright worker image.
- `$env:ENABLE_WEBSOCKETS = 'true'` — Enables backend WebSocket connections for live run updates.
- `$env:VITE_ENABLE_WEBSOCKETS = 'true'` — Enables the frontend's live WebSocket connection.
- `npm.cmd run dev` — Starts ATOM's backend and frontend with the settings above.