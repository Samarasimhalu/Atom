import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
} from "lucide-react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

const stateMeta = {
  requested: { label: "Requested", tone: "neutral" },
  validated: { label: "Validated", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  assigned: { label: "Assigned", tone: "neutral" },
  running: { label: "Running", tone: "active" },
  collecting_artifacts: { label: "Collecting evidence", tone: "active" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Failed", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const demoDashboard = {
  totalRuns: 47,
  states: {
    requested: 3,
    validated: 5,
    queued: 2,
    assigned: 1,
    running: 4,
    collecting_artifacts: 2,
    passed: 26,
    failed: 3,
    cancelled: 1,
  },
  successRate: 87,
  averageDurationMs: 32400,
  recentRuns: [
    { id: "demo-run-7f2c91a4", state: "passed", created_at: new Date(Date.now() - 3 * 60_000).toISOString(), result: { duration: 28400 } },
    { id: "demo-run-3b8e15d0", state: "running", created_at: new Date(Date.now() - 8 * 60_000).toISOString(), result: null },
    { id: "demo-run-a94d62c1", state: "failed", created_at: new Date(Date.now() - 17 * 60_000).toISOString(), result: { duration: 51200 } },
    { id: "demo-run-51e7c903", state: "passed", created_at: new Date(Date.now() - 34 * 60_000).toISOString(), result: { duration: 19600 } },
    { id: "demo-run-f8064b2a", state: "queued", created_at: new Date(Date.now() - 46 * 60_000).toISOString(), result: null },
  ],
};

function formatDuration(value) {
  const milliseconds = Number(value || 0);
  if (!milliseconds) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function formatTimestamp(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatePill({ state }) {
  const meta = stateMeta[state] || { label: state || "Unknown", tone: "neutral" };
  return (
    <span className={`dashboard-state dashboard-state--${meta.tone}`}>
      <span aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function LiveStatus({ status, onReconnect }) {
  const connected = status === "connected";
  const reconnecting = status === "connecting" || status === "reconnecting";
  const label = connected
    ? "Live updates"
    : reconnecting
      ? "Reconnecting"
      : status === "disabled"
        ? "Live updates off"
        : "Offline";
  const Icon = connected ? Wifi : WifiOff;

  return (
    <div className={`dashboard-live dashboard-live--${connected ? "connected" : "quiet"}`}>
      <span>
        <Icon className={reconnecting ? "dashboard-spin" : ""} size={15} aria-hidden="true" />
        {label}
      </span>
      {status !== "disabled" && !connected ? (
        <button type="button" onClick={onReconnect} aria-label="Reconnect live updates">
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <article className="dashboard-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

export default function EnterpriseDashboard({
  refreshSignal = 0,
  executionEvent = null,
  focusedRunId = null,
  streamStatus = "disabled",
  liveTransitions = [],
  onReconnect,
  onRunSelected,
}) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(focusedRunId);
  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedRunError, setSelectedRunError] = useState(null);

  const requestHeaders = useMemo(
    () => ({
      ...(import.meta.env.VITE_AUTH_TOKEN
        ? { Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}` }
        : {}),
      ...(import.meta.env.VITE_DEV_USER ? { "X-Dev-User": import.meta.env.VITE_DEV_USER } : {}),
      ...(import.meta.env.VITE_DEV_TENANT_ID
        ? { "X-Tenant-Id": import.meta.env.VITE_DEV_TENANT_ID }
        : {}),
    }),
    [],
  );

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setRefreshing(true);
      try {
        const response = await fetch(`${apiBaseUrl}/api/dashboard`, {
          headers: requestHeaders,
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sign in to load tenant operations data."
              : "Operations data is currently unavailable.",
          );
        }
        const liveDashboard = await response.json();
        if (import.meta.env.DEV && !liveDashboard.totalRuns) {
          setDashboard(demoDashboard);
          setDemoMode(true);
        } else {
          setDashboard(liveDashboard);
          setDemoMode(false);
        }
        setError(null);
        setLastUpdated(new Date());
      } catch (loadError) {
        if (import.meta.env.DEV) {
          setDashboard(demoDashboard);
          setDemoMode(true);
        }
        setError(loadError.message || "Operations data is currently unavailable.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [requestHeaders],
  );

  const loadRun = useCallback(
    async (runId) => {
      if (runId.startsWith("demo-run-")) {
        const run = demoDashboard.recentRuns.find((item) => item.id === runId);
        if (!run) throw new Error("Sample run details are unavailable.");
        setSelectedRun(run);
        setSelectedRunError(null);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}`, {
        headers: requestHeaders,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Run details are currently unavailable.");
      setSelectedRun(await response.json());
      setSelectedRunError(null);
    },
    [requestHeaders],
  );

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  useEffect(() => {
    if (focusedRunId) setSelectedRunId(focusedRunId);
  }, [focusedRunId]);

  useEffect(() => {
    if (executionEvent?.type?.startsWith("run.") || executionEvent?.type === "execution-submitted") {
      void load({ silent: true });
    }
  }, [executionEvent, load]);

  useEffect(() => {
    if (!selectedRunId) return;
    let active = true;
    loadRun(selectedRunId).catch((loadError) => {
      if (active) setSelectedRunError(loadError.message || "Run details are currently unavailable.");
    });
    return () => {
      active = false;
    };
  }, [loadRun, selectedRunId]);

  const states = dashboard?.states || {};
  const passed = Number(states.passed || 0);
  const failed = Number(states.failed || 0);
  const cancelled = Number(states.cancelled || 0);
  const completed = passed + failed + cancelled;
  const inFlight =
    Number(states.requested || 0) +
    Number(states.validated || 0) +
    Number(states.queued || 0) +
    Number(states.assigned || 0) +
    Number(states.running || 0) +
    Number(states.collecting_artifacts || 0);
  const recentRuns = dashboard?.recentRuns || [];
  const activeEvent =
    liveTransitions[0] || executionEvent?.payload || executionEvent?.result || executionEvent;
  const totalRuns = Number(dashboard?.totalRuns || 0);
  const successRate = Number(dashboard?.successRate || 0);
  const waiting =
    Number(states.requested || 0) +
    Number(states.validated || 0) +
    Number(states.queued || 0) +
    Number(states.assigned || 0);
  const statusItems = [
    ["Running", Number(states.running || 0)],
    ["Waiting", waiting],
    ["Collecting evidence", Number(states.collecting_artifacts || 0)],
    ["Passed", passed],
    ["Failed", failed],
    ["Cancelled", cancelled],
  ];

  const selectRun = (run) => {
    setSelectedRunId(run.id);
    setSelectedRun(run);
    setSelectedRunError(null);
    if (!run.id.startsWith("demo-run-")) onRunSelected?.(run.id);
  };

  return (
    <section id="atom-overview" aria-labelledby="dashboard-title" className="dashboard-page-content">
      <header className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">Operations</p>
          <h1 id="dashboard-title">Dashboard</h1>
          <p className="dashboard-description">
            A concise view of test activity and execution health.
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <LiveStatus status={streamStatus} onReconnect={onReconnect} />
          <span className="dashboard-updated">
            {demoMode
              ? "Preview data"
              : lastUpdated
                ? `Updated ${formatTimestamp(lastUpdated)}`
                : "Waiting for data"}
          </span>
          <button
            type="button"
            className="dashboard-refresh"
            onClick={() => void load()}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "dashboard-spin" : ""} size={15} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {demoMode ? (
        <div className="dashboard-notice" role="status">
          <span>
            <strong>Preview data</strong>
            {error
              ? ` — Live data unavailable: ${error} Sample metrics are not saved.`
              : " — Sample metrics are not saved."}
          </span>
          <button type="button" onClick={() => void load()} disabled={refreshing}>
            Retry live data
          </button>
        </div>
      ) : null}
      {!demoMode && error ? (
        <div className="dashboard-notice dashboard-notice--error" role="alert">
          <span>
            <strong>Dashboard unavailable</strong> — {error}
          </span>
          <button type="button" onClick={() => void load()} disabled={refreshing}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="dashboard-metrics" aria-label="Run summary">
        <Metric
          label="Total runs"
          value={loading ? "—" : totalRuns.toLocaleString()}
          detail="Across this workspace"
        />
        <Metric
          label="Completed"
          value={loading ? "—" : completed.toLocaleString()}
          detail={`${passed} passed · ${failed} failed · ${cancelled} cancelled`}
        />
        <Metric
          label="In progress"
          value={loading ? "—" : inFlight.toLocaleString()}
          detail="Queued or executing"
        />
        <Metric
          label="Success rate"
          value={loading ? "—" : `${Math.round(successRate)}%`}
          detail={
            dashboard?.averageDurationMs == null
              ? "Completed runs passing"
              : `Avg. ${formatDuration(dashboard.averageDurationMs)}`
          }
        />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-runs" aria-labelledby="recent-runs-title">
          <div className="dashboard-panel-heading">
            <div>
              <h2 id="recent-runs-title">Recent runs</h2>
              <p>Select a run to view its live status.</p>
            </div>
            <span className="dashboard-count">{recentRuns.length} shown</span>
          </div>

          {recentRuns.length ? (
            <ul className="dashboard-run-list">
              {recentRuns.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    className="dashboard-run"
                    aria-pressed={selectedRunId === run.id}
                    onClick={() => selectRun(run)}
                  >
                    <span className="dashboard-run-main">
                      <code>{String(run.id).slice(0, 16)}</code>
                      <span className="dashboard-run-meta">
                        <StatePill state={run.state} />
                        <span>{formatTimestamp(run.created_at || run.createdAt)}</span>
                      </span>
                    </span>
                    <span className="dashboard-run-duration">
                      {formatDuration(run.result?.duration)}
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dashboard-empty">
              {loading ? "Loading recent runs…" : "No runs are available for this workspace yet."}
            </div>
          )}

          {selectedRun || selectedRunError ? (
            <div className="dashboard-selected-run" role={selectedRunError ? "alert" : "status"}>
              {selectedRunError ? (
                selectedRunError
              ) : (
                <>
                  <span>Selected run</span>
                  <code>{String(selectedRun.id).slice(0, 20)}</code>
                  <StatePill state={selectedRun.state} />
                </>
              )}
            </div>
          ) : null}
        </section>

        <div className="dashboard-side">
          <section className="dashboard-panel dashboard-health" aria-labelledby="run-health-title">
            <div className="dashboard-panel-heading">
              <div>
                <h2 id="run-health-title">Run health</h2>
                <p>Current state distribution</p>
              </div>
              <Activity size={17} aria-hidden="true" />
            </div>
            <div
              className="dashboard-progress"
              role="img"
              aria-label={`${Math.round(successRate)} percent success rate`}
            >
              <span style={{ width: `${Math.min(100, Math.max(0, successRate))}%` }} />
            </div>
            <div className="dashboard-health-score">
              <strong>{loading ? "—" : `${Math.round(successRate)}%`}</strong>
              <span>successful completed runs</span>
            </div>
            <div className="dashboard-status-list">
              {statusItems.map(([label, count]) => (
                <div key={label}>
                  <span><i className={`dashboard-status-dot dashboard-status-dot--${label.toLowerCase()}`} />{label}</span>
                  <strong>{loading ? "—" : count.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-panel dashboard-activity" aria-labelledby="live-activity-title">
            <div className="dashboard-panel-heading">
              <div>
                <h2 id="live-activity-title">Live activity</h2>
                <p>Latest execution update</p>
              </div>
              {activeEvent?.state || activeEvent?.status ? (
                <StatePill state={activeEvent.state || activeEvent.status} />
              ) : (
                <LoaderCircle size={17} aria-hidden="true" />
              )}
            </div>
            {activeEvent?.state || activeEvent?.status ? (
              <p className="dashboard-activity-copy">
                {activeEvent.runId
                  ? `Run ${String(activeEvent.runId).slice(0, 16)} updated`
                  : "Execution update received"}
                {activeEvent.occurredAt ? ` · ${formatTimestamp(activeEvent.occurredAt)}` : ""}
              </p>
            ) : (
              <p className="dashboard-activity-copy">
                {streamStatus === "connected"
                  ? "Waiting for the next run update."
                  : "Live updates are unavailable. Refresh to check for changes."}
              </p>
            )}
            {liveTransitions.length ? (
              <ul className="dashboard-transition-list" aria-label="Recent live transitions">
                {liveTransitions.slice(0, 3).map((event, index) => (
                  <li key={`${event.runId}-${event.sequence}-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRunId(event.runId);
                        onRunSelected?.(event.runId);
                      }}
                    >
                      <span>{String(event.runId).slice(0, 14)}</span>
                      <StatePill state={event.state} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            </section>
        </div>
      </div>
    </section>
  );
}
