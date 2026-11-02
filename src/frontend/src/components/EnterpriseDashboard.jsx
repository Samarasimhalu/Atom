import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Bot, CheckCircle2, ChevronRight, Database,
  Gauge, KeyRound, LoaderCircle, Radio, RefreshCw, RotateCcw, ShieldCheck,
  Signal, TrendingUp, Wifi, WifiOff,
  XCircle
} from 'lucide-react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const stateMeta = {
  requested: { label: 'Requested', tone: 'bg-slate-400', text: 'text-slate-600', color: '#94a3b8' },
  validated: { label: 'Validated', tone: 'bg-blue-500', text: 'text-blue-700', color: '#3b82f6' },
  queued: { label: 'Queued', tone: 'bg-amber-500', text: 'text-amber-700', color: '#f59e0b' },
  assigned: { label: 'Assigned', tone: 'bg-violet-500', text: 'text-violet-700', color: '#8b5cf6' },
  running: { label: 'Running', tone: 'bg-emerald-700', text: 'text-emerald-800', color: '#047857' },
  collecting_artifacts: { label: 'Collecting evidence', tone: 'bg-indigo-500', text: 'text-indigo-700', color: '#6366f1' },
  passed: { label: 'Passed', tone: 'bg-emerald-500', text: 'text-emerald-700', color: '#10b981' },
  failed: { label: 'Failed', tone: 'bg-rose-500', text: 'text-rose-700', color: '#f43f5e' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-500', text: 'text-slate-600', color: '#64748b' }
};

const chartStates = Object.keys(stateMeta);
const gaugeLength = 238.76;
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
    cancelled: 1
  },
  successRate: 87,
  averageDurationMs: 32400,
  recentRuns: [
    { id: 'demo-run-7f2c91a4', state: 'passed', created_at: new Date(Date.now() - 3 * 60_000).toISOString(), result: { duration: 28400 } },
    { id: 'demo-run-3b8e15d0', state: 'running', created_at: new Date(Date.now() - 8 * 60_000).toISOString(), result: null },
    { id: 'demo-run-a94d62c1', state: 'failed', created_at: new Date(Date.now() - 17 * 60_000).toISOString(), result: { duration: 51200 } },
    { id: 'demo-run-51e7c903', state: 'passed', created_at: new Date(Date.now() - 34 * 60_000).toISOString(), result: { duration: 19600 } },
    { id: 'demo-run-f8064b2a', state: 'queued', created_at: new Date(Date.now() - 46 * 60_000).toISOString(), result: null }
  ]
};

function getPieSlicePath(startAngle, endAngle, radius = 82) {
  const toPoint = angle => {
    const radians = (angle * Math.PI) / 180;
    return [100 + radius * Math.cos(radians), 100 + radius * Math.sin(radians)];
  };
  const [startX, startY] = toPoint(startAngle);
  if (endAngle - startAngle >= 359.99) {
    const [middleX, middleY] = toPoint(startAngle + 180);
    return `M 100 100 L ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${middleX} ${middleY} A ${radius} ${radius} 0 1 1 ${startX} ${startY} Z`;
  }
  const [endX, endY] = toPoint(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M 100 100 L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

function formatDuration(value) {
  const milliseconds = Number(value || 0);
  if (!milliseconds) return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function formatTimestamp(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function useCountUp(target, enabled, duration = 950) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || target == null || !Number.isFinite(Number(target))) return undefined;
    const end = Number(target);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(end);
      return undefined;
    }

    let frameId;
    const startTime = performance.now();
    const animate = now => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - ((1 - progress) ** 3);
      setCount(end * eased);
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [duration, enabled, target]);

  return count;
}

function AnimatedNumber({ value, enabled, formatValue = number => Math.round(number).toLocaleString() }) {
  const count = useCountUp(value, enabled);
  return <>{formatValue(count)}</>;
}

function StatePill({ state }) {
  const meta = stateMeta[state] || { label: state || 'Unknown', tone: 'bg-slate-400', text: 'text-slate-600' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.tone}`} />{meta.label}</span>;
}

function MetricCard({ icon, label, value, helper, featured = false, tone = 'emerald', formatValue = number => Math.round(number).toLocaleString() }) {
  const animatedValue = useCountUp(value, value != null);
  const Icon = icon;
  const toneStyles = {
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
    sky: 'border-sky-200 bg-sky-50/85 text-sky-950'
  };
  const toneIconStyles = {
    emerald: 'bg-emerald-100 text-emerald-800',
    sky: 'bg-sky-100 text-sky-800'
  };

  return <article className={`group relative min-w-0 overflow-hidden rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${featured ? 'border-emerald-800 bg-emerald-800 text-white shadow-[0_12px_30px_-18px_rgba(6,78,59,0.75)]' : toneStyles[tone]}`} aria-label={`${label}: ${value == null ? 'loading' : formatValue(value)}`}>
    {featured ? <div className="pointer-events-none absolute -right-7 -top-8 h-28 w-28 rounded-full bg-emerald-500/30 blur-2xl" /> : null}
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-xs font-medium ${featured ? 'text-emerald-100' : tone === 'sky' ? 'text-sky-800' : 'text-emerald-800'}`}>{label}</p>
        <p aria-hidden="true" className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${featured ? 'text-white' : tone === 'sky' ? 'text-sky-950' : 'text-emerald-950'}`}>{value == null ? '—' : formatValue(animatedValue)}</p>
        <p className={`mt-1 text-xs ${featured ? 'text-emerald-100/80' : tone === 'sky' ? 'text-sky-700' : 'text-emerald-700'}`}>{helper}</p>
      </div>
      <span className={`rounded-xl p-2.5 ${featured ? 'bg-white/10 text-white' : toneIconStyles[tone]}`}><Icon className="h-4 w-4" /></span>
    </div>
  </article>;
}

function LiveStatus({ status = 'disabled', onReconnect }) {
  const enabled = status !== 'disabled';
  const connected = status === 'connected';
  const reconnecting = status === 'connecting' || status === 'reconnecting';
  const label = !enabled ? 'Live mode off' : connected ? 'Live updates on' : reconnecting ? 'Reconnecting' : 'Offline';
  const Icon = !enabled ? WifiOff : connected ? Wifi : reconnecting ? RotateCcw : WifiOff;
  const color = !enabled ? 'bg-slate-100 text-slate-600' : connected ? 'bg-emerald-50 text-emerald-800' : reconnecting ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';

  return <div className="flex items-center gap-1.5">
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${color}`}><Icon className={`h-3.5 w-3.5 ${reconnecting ? 'animate-spin' : ''}`} /><span>{label}</span></span>
    {enabled && !connected ? <button type="button" onClick={onReconnect} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Reconnect live updates"><RotateCcw className="h-3.5 w-3.5" /></button> : null}
  </div>;
}

function TransitionFeed({ transitions, selectedRunId, onSelect }) {
  return <article id="atom-live-feed" className="rounded-2xl border border-violet-200 bg-violet-50/75 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-violet-950">Live transition feed</p><p className="mt-1 text-xs text-violet-800/75">WebSocket updates; durable APIs remain authoritative</p></div><Radio className="h-5 w-5 text-violet-700" /></div>
    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{transitions.length ? transitions.map((event, index) => <button key={`${event.runId}-${event.sequence}-${index}`} type="button" onClick={() => onSelect(event.runId)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedRunId === event.runId ? 'border-violet-300 bg-violet-100' : 'border-violet-100 bg-violet-100/45 hover:border-violet-200 hover:bg-violet-100/80'}`}><span className={`h-2 w-2 shrink-0 rounded-full ${stateMeta[event.state]?.tone || 'bg-slate-400'}`} /><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs text-violet-950">{event.runId.slice(0, 16)}</p><p className="mt-1 text-[11px] text-violet-800/75">{stateMeta[event.state]?.label || event.state} · {formatTimestamp(event.occurredAt)}</p></div><ChevronRight className="h-4 w-4 text-violet-500" /></button>) : <div className="rounded-xl border border-dashed border-violet-200 bg-violet-100/40 px-4 py-7 text-center text-xs leading-5 text-violet-800/75 sm:col-span-2 xl:col-span-3">New run-state transitions will appear here when live mode is enabled.</div>}</div>
  </article>;
}

function Guardrail({ icon, label, detail, status = 'Enforced' }) {
  const Icon = icon;
  return <div className={`flex items-start gap-3 rounded-xl p-3 ${status === 'Gated' ? 'bg-amber-100/65' : 'bg-indigo-100/55'}`}><span className={`mt-0.5 rounded-lg p-2 ${status === 'Gated' ? 'bg-amber-200/70 text-amber-800' : 'bg-indigo-200/70 text-indigo-800'}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-800">{label}</p><span className={`text-[10px] font-semibold uppercase tracking-wider ${status === 'Gated' ? 'text-amber-700' : 'text-indigo-800'}`}>{status}</span></div><p className="mt-0.5 text-xs leading-5 text-slate-600">{detail}</p></div></div>;
}

export default function EnterpriseDashboard({ refreshSignal = 0, executionEvent = null, focusedRunId = null, streamStatus = 'disabled', liveTransitions = [], onReconnect, onRunSelected }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(focusedRunId);
  const [selectedRun, setSelectedRun] = useState(null);
  const [chartsReady, setChartsReady] = useState(false);
  const [hoveredPie, setHoveredPie] = useState(null);

  const requestHeaders = useMemo(() => ({
    ...(import.meta.env.VITE_AUTH_TOKEN ? { Authorization: `Bearer ${import.meta.env.VITE_AUTH_TOKEN}` } : {}),
    ...(import.meta.env.VITE_DEV_USER ? { 'X-Dev-User': import.meta.env.VITE_DEV_USER } : {}),
    ...(import.meta.env.VITE_DEV_TENANT_ID ? { 'X-Tenant-Id': import.meta.env.VITE_DEV_TENANT_ID } : {})
  }), []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/dashboard`, { headers: requestHeaders, credentials: 'include' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in to load tenant operations data.' : 'Operations data is currently unavailable.');
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
      setError(loadError.message || 'Operations data is currently unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestHeaders]);

  const loadRun = useCallback(async runId => {
    if (runId.startsWith('demo-run-')) {
      const run = demoDashboard.recentRuns.find(item => item.id === runId);
      if (!run) throw new Error('demo_run_not_found');
      setSelectedRun(run);
      return run;
    }
    const response = await fetch(`${apiBaseUrl}/api/runs/${encodeURIComponent(runId)}`, { headers: requestHeaders, credentials: 'include' });
    if (!response.ok) throw new Error('run_refresh_failed');
    const run = await response.json();
    setSelectedRun(run);
    return run;
  }, [requestHeaders]);

  useEffect(() => { load(); }, [load, refreshSignal]);
  useEffect(() => { if (focusedRunId) setSelectedRunId(focusedRunId); }, [focusedRunId]);
  useEffect(() => {
    if (executionEvent?.type?.startsWith('run.') || executionEvent?.type === 'execution-submitted') load({ silent: true });
  }, [executionEvent, load]);
  useEffect(() => { if (selectedRunId) void loadRun(selectedRunId).catch(() => {}); }, [loadRun, selectedRunId]);
  useEffect(() => {
    if (!dashboard || chartsReady) return undefined;
    const frameId = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(frameId);
  }, [chartsReady, dashboard]);

  const states = dashboard?.states || {};
  const inFlight = (states.requested || 0) + (states.validated || 0) + (states.queued || 0) + (states.assigned || 0) + (states.running || 0) + (states.collecting_artifacts || 0);
  const passed = states.passed || 0;
  const failed = states.failed || 0;
  const terminal = passed + failed + (states.cancelled || 0);
  const recentRuns = dashboard?.recentRuns || [];
  const stateEntries = chartStates.map(state => [state, states[state] || 0]);
  const totalStateRuns = stateEntries.reduce((total, [, count]) => total + count, 0);
  let nextPieAngle = -90;
  const pieSlices = stateEntries.flatMap(([state, count]) => {
    if (!count || !totalStateRuns) return [];
    const startAngle = nextPieAngle;
    const endAngle = startAngle + (count / totalStateRuns) * 360;
    nextPieAngle = endAngle;
    return [{ state, count, startAngle, endAngle, path: getPieSlicePath(startAngle, endAngle) }];
  });
  const activeEvent = liveTransitions[0] || executionEvent?.payload || executionEvent?.result || executionEvent;
  const successRate = Number(dashboard?.successRate || 0);
  const averageDuration = dashboard?.averageDurationMs == null ? null : Number(dashboard.averageDurationMs);
  const animatedDuration = useCountUp(averageDuration, chartsReady);
  const animatedSuccessRate = useCountUp(successRate, chartsReady && !loading);

  return <section id="atom-overview" aria-label="Atom operations dashboard" className="mb-8 overflow-hidden rounded-[26px] border border-slate-200 bg-white/70 text-slate-800 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.28)] backdrop-blur-sm">
    <div className="p-4 sm:p-6 lg:p-8">
        <header className="mb-7 flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500"><span>Workspace</span><ChevronRight className="h-3 w-3" /><span className="text-slate-700">Overview</span></div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Monitor your test runs, delivery, and policy posture.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <LiveStatus status={streamStatus} onReconnect={onReconnect} />
            <div className="hidden text-right sm:block"><p className="text-[10px] text-slate-400">{demoMode ? 'Preview mode' : 'Last synchronized'}</p><p className="mt-0.5 text-xs font-medium text-slate-600">{demoMode ? 'Sample metrics' : lastUpdated ? formatTimestamp(lastUpdated) : 'Awaiting data'}</p></div>
            <button type="button" onClick={() => load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </header>

        {demoMode ? <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"><div><p className="font-medium">Sample dashboard data</p><p className="mt-1 text-sky-800/80">{error ? `Live API unavailable: ${error}. Showing sample metrics for preview only; this data is not saved.` : 'Preview metrics only; this data is not saved.'}</p></div><button type="button" onClick={() => load()} disabled={refreshing} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-900 underline underline-offset-4">Retry live data <ArrowUpRight className="h-3.5 w-3.5" /></button></div> : null}
        {!demoMode && error ? <div role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Dashboard connection requires attention</p><p className="mt-1 text-amber-800/80">{error}</p><button type="button" onClick={() => { setError(null); load(); }} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline underline-offset-4">Retry connection <ArrowUpRight className="h-3.5 w-3.5" /></button></div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard icon={Activity} label="All runs" value={loading ? null : Number(dashboard?.totalRuns || 0)} helper="Tenant-scoped history" featured />
          <MetricCard icon={CheckCircle2} label="Completed runs" value={loading ? null : terminal} helper={`${passed} passed · ${failed} failed`} tone="emerald" />
          <MetricCard icon={LoaderCircle} label="In flight" value={loading ? null : inFlight} helper="Queued, assigned, or running" tone="sky" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <article id="atom-activity" className="rounded-2xl border border-violet-200 bg-violet-50/75 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="text-base font-semibold text-violet-950">Run activity</p><p className="mt-1 text-sm text-violet-800/75">Run distribution by state</p></div><span className="rounded-xl bg-violet-100 p-2.5 text-violet-800"><Gauge className="h-5 w-5" /></span></div>
            <div className="mt-4 flex flex-col items-center">
              <div className="relative mx-auto aspect-square w-full max-w-[300px]" role="group" aria-label="Run distribution pie chart">
                {hoveredPie ? <div role="status" className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-center shadow-lg" style={{ left: hoveredPie.x, top: hoveredPie.y, marginTop: '-12px' }}>
                  <p className="whitespace-nowrap text-sm font-semibold text-slate-900">{stateMeta[hoveredPie.state].label}</p>
                  <p className="whitespace-nowrap text-xs text-slate-600">{states[hoveredPie.state] || 0} runs · {totalStateRuns ? Math.round(((states[hoveredPie.state] || 0) / totalStateRuns) * 100) : 0}%</p>
                </div> : null}
                <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
                  {totalStateRuns === 0 ? <circle cx="100" cy="100" r="82" fill="#e2e8f0" /> : pieSlices.map(({ state, path }, index) => (
                    <path
                      key={state}
                      d={path}
                      fill={stateMeta[state].color}
                      stroke="white"
                      strokeWidth="2"
                      tabIndex={0}
                      aria-label={`${stateMeta[state].label}: ${states[state]} runs, ${Math.round((states[state] / totalStateRuns) * 100)} percent`}
                      onMouseEnter={event => {
                        const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
                        setHoveredPie({ state, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
                      }}
                      onMouseMove={event => {
                        const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
                        setHoveredPie({ state, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
                      }}
                      onMouseLeave={() => setHoveredPie(null)}
                      onFocus={() => setHoveredPie({ state, x: '50%', y: '28%' })}
                      onBlur={() => setHoveredPie(null)}
                      style={{ opacity: chartsReady ? 1 : 0, transform: chartsReady ? 'scale(1)' : 'scale(0.82)', transformOrigin: 'center', transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : `opacity 450ms ease ${index * 65}ms, transform 700ms cubic-bezier(.22,1,.36,1) ${index * 65}ms` }}
                    />
                  ))}
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-violet-200/80 pt-3 text-sm text-violet-900/80"><span><AnimatedNumber value={dashboard?.totalRuns || 0} enabled={chartsReady} /> total runs tracked</span><span>{totalStateRuns.toLocaleString()} in chart</span></div>
          </article>

          <article className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-teal-950">Success rate</p><p className="mt-1 text-xs text-teal-800/75">Completed test runs passing</p></div><span className="rounded-xl bg-teal-100 p-2.5 text-teal-800"><TrendingUp className="h-4 w-4" /></span></div>
            <div className="relative mx-auto mt-3 h-32 max-w-[230px]" role="img" aria-label={`Success rate ${Math.round(successRate)} percent`}>
              <svg viewBox="0 0 200 112" className="h-full w-full overflow-visible" aria-hidden="true">
                <path d="M 24 96 A 76 76 0 0 1 176 96" fill="none" stroke="#cce9e5" strokeWidth="17" strokeLinecap="round" />
                <path d="M 24 96 A 76 76 0 0 1 176 96" fill="none" stroke="#0f766e" strokeWidth="17" strokeLinecap="round" strokeDasharray={gaugeLength} strokeDashoffset={chartsReady ? gaugeLength * (1 - Math.min(100, successRate) / 100) : gaugeLength} style={{ transition: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'stroke-dashoffset 1300ms cubic-bezier(.22,1,.36,1) 150ms' }} />
              </svg>
              <div className="absolute inset-x-0 bottom-0 text-center"><p className="text-3xl font-semibold tracking-tight text-teal-950 tabular-nums">{loading ? '—' : `${Math.round(animatedSuccessRate)}%`}</p><p className="mt-0.5 text-[10px] text-teal-800/75">Run success</p></div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-teal-200/80 pt-3 text-center">
              <div><p className="text-sm font-semibold text-emerald-800 tabular-nums"><AnimatedNumber value={passed} enabled={chartsReady} /></p><p className="mt-0.5 text-[10px] text-teal-800/70">Passed</p></div>
              <div><p className="text-sm font-semibold text-rose-600 tabular-nums"><AnimatedNumber value={failed} enabled={chartsReady} /></p><p className="mt-0.5 text-[10px] text-teal-800/70">Failed</p></div>
              <div><p className="text-sm font-semibold text-teal-950 tabular-nums">{averageDuration == null ? '—' : formatDuration(animatedDuration)}</p><p className="mt-0.5 text-[10px] text-teal-800/70">Avg. duration</p></div>
            </div>
          </article>
          <article className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80">
            <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 px-4 py-4 sm:px-5"><div><p className="text-sm font-semibold text-amber-950">Recent runs</p><p className="mt-1 text-xs text-amber-800/75">Select a run to follow its authorized lifecycle channel</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{recentRuns.length} visible</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[430px] text-left text-sm"><thead className="bg-amber-100/70 text-[10px] uppercase tracking-[0.13em] text-amber-900/70"><tr><th className="px-3 py-3 font-medium sm:px-4">Run</th><th className="px-3 py-3 font-medium">State</th><th className="px-3 py-3 font-medium">Submitted</th><th className="px-3 py-3 text-right font-medium sm:px-4">Duration</th></tr></thead><tbody>
              {recentRuns.length ? recentRuns.map(run => <tr key={run.id} onClick={() => { setSelectedRunId(run.id); if (!run.id.startsWith('demo-run-')) onRunSelected?.(run.id); }} className={`cursor-pointer border-t border-amber-100 transition hover:bg-amber-100/70 ${selectedRunId === run.id ? 'bg-amber-100/70' : ''}`}><td className="px-3 py-3.5 font-mono text-xs text-amber-950 sm:px-4">{String(run.id).slice(0, 12)}</td><td className="px-3 py-3.5"><StatePill state={run.state} /></td><td className="px-3 py-3.5 text-xs text-amber-900/70">{formatTimestamp(run.created_at || run.createdAt)}</td><td className="px-3 py-3.5 text-right text-xs tabular-nums text-amber-950/80 sm:px-4">{formatDuration(run.result?.duration)}</td></tr>) : <tr><td colSpan="4" className="px-5 py-10 text-center text-sm text-amber-900/70">No durable run records are available for this tenant.</td></tr>}
            </tbody></table></div>
            {selectedRun ? <div className="border-t border-amber-200/80 bg-amber-100/65 px-4 py-3 text-xs text-amber-900/75 sm:px-5"><span className="font-medium text-amber-950">Focused run:</span> <span className="font-mono">{String(selectedRun.id).slice(0, 16)}</span><span className="mx-2 text-amber-500">·</span><StatePill state={selectedRun.state} /></div> : null}
          </article>
        </div>

        <div className="mt-5 grid gap-5">
          <article className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-rose-950">Latest execution signal</p><p className="mt-1 text-xs text-rose-800/75">Live run status</p></div><Bot className="h-5 w-5 text-rose-700" /></div>
            {activeEvent?.state || activeEvent?.status ? <div className="mt-5"><StatePill state={activeEvent.state || activeEvent.status} /><p className="mt-4 text-sm font-medium text-rose-950">{activeEvent.runId ? `Run ${String(activeEvent.runId).slice(0, 12)} updated` : 'Execution update received'}</p><p className="mt-1 text-xs leading-5 text-rose-800/75">{activeEvent.occurredAt ? `Received ${formatTimestamp(activeEvent.occurredAt)}.` : 'The dashboard will reconcile against the tenant run ledger.'}</p></div> : <div className="mt-4 rounded-xl border border-rose-200/80 bg-rose-100/50 p-4 text-sm leading-6 text-rose-800/75">Enable live mode to receive state transitions; manual refresh remains available.</div>}
          </article>
          <TransitionFeed transitions={liveTransitions} selectedRunId={selectedRunId} onSelect={runId => { setSelectedRunId(runId); onRunSelected?.(runId); }} />
        </div>

        <div id="atom-guardrails" className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(270px,0.9fr)]">
          <article className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-cyan-950">Live delivery model</p><p className="mt-1 text-xs text-cyan-800/75">Events invalidate views; durable APIs provide the source of truth</p></div><Signal className="h-5 w-5 text-cyan-800" /></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">{[['1. Receive', 'Validate sequence'], ['2. Reconcile', 'Refetch durable state'], ['3. Recover', 'Replay on reconnect']].map(([step, detail]) => <div key={step} className="rounded-xl border border-cyan-100 bg-cyan-100/55 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">{step}</p><p className="mt-2 text-sm font-medium text-cyan-950/85">{detail}</p></div>)}</div>
          </article>
          <article className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 sm:p-5">
            <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-950">Guardrail posture</p><p className="mt-1 text-xs text-indigo-800/75">Controls applied before execution and live delivery</p></div><ShieldCheck className="h-5 w-5 text-indigo-800" /></div>
            <div className="mt-4 space-y-2.5"><Guardrail icon={ShieldCheck} label="Tenant boundary" detail="Dashboard events are tenant scoped and permission gated." /><Guardrail icon={KeyRound} label="Approval binding" detail="High-risk execution remains bound to policy and intent." /><Guardrail icon={Database} label="Durable evidence" detail="Run details and artifacts are fetched through authorized APIs." /><Guardrail icon={XCircle} label="Remote egress" detail="Fail-closed until the managed egress gate is satisfied." status="Gated" /></div>
          </article>
        </div>
      </div>
  </section>;
}
