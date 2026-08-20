import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Bot, CheckCircle2, ChevronRight, CircleDot, Clock3,
  Database, Gauge, KeyRound, LoaderCircle, Radio, RefreshCw, RotateCcw,
  ShieldCheck, Signal, TimerReset, TrendingUp, Wifi, WifiOff, XCircle
} from 'lucide-react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const stateMeta = {
  requested: { label: 'Requested', tone: 'bg-slate-400', text: 'text-slate-300' },
  validated: { label: 'Validated', tone: 'bg-blue-400', text: 'text-blue-200' },
  queued: { label: 'Queued', tone: 'bg-amber-400', text: 'text-amber-200' },
  assigned: { label: 'Assigned', tone: 'bg-violet-400', text: 'text-violet-200' },
  running: { label: 'Running', tone: 'bg-cyan-400', text: 'text-cyan-200' },
  collecting_artifacts: { label: 'Collecting evidence', tone: 'bg-indigo-400', text: 'text-indigo-200' },
  passed: { label: 'Passed', tone: 'bg-emerald-400', text: 'text-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-rose-400', text: 'text-rose-200' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-500', text: 'text-slate-300' }
};

function formatDuration(value) {
  const milliseconds = Number(value || 0);
  if (!milliseconds) return '—';
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function formatTimestamp(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function StatePill({ state }) {
  const meta = stateMeta[state] || { label: state || 'Unknown', tone: 'bg-slate-500', text: 'text-slate-300' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.tone}`} />{meta.label}</span>;
}

function MetricCard({ icon, label, value, helper, accent = 'text-cyan-300' }) {
  return <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]">
    <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/[0.035] blur-2xl" />
    <div className="relative flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.13em] text-slate-400">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${accent}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div><span className="rounded-xl border border-white/10 bg-black/10 p-2.5 text-slate-300">{createElement(icon, { className: 'h-4 w-4' })}</span></div>
  </article>;
}

function Guardrail({ icon, label, detail, status = 'Enforced' }) {
  return <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/10 p-3"><span className="mt-0.5 rounded-lg bg-emerald-400/10 p-2 text-emerald-300">{createElement(icon, { className: 'h-4 w-4' })}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-100">{label}</p><span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">{status}</span></div><p className="mt-0.5 text-xs leading-5 text-slate-400">{detail}</p></div></div>;
}

function LiveStatus({ status = 'disabled', onReconnect }) {
  const enabled = status !== 'disabled';
  const connected = status === 'connected';
  const reconnecting = status === 'connecting' || status === 'reconnecting';
  const label = !enabled ? 'Live mode off' : connected ? 'Live' : reconnecting ? 'Reconnecting' : 'Offline';
  const Icon = !enabled ? WifiOff : connected ? Wifi : reconnecting ? RotateCcw : WifiOff;
  const color = !enabled ? 'border-slate-400/20 bg-slate-400/10 text-slate-300' : connected ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : reconnecting ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-rose-300/20 bg-rose-300/10 text-rose-100';
  return <div className="flex items-center gap-2"><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${color}`}><Icon className={`h-3.5 w-3.5 ${reconnecting ? 'animate-spin' : ''}`} /><span>{label}</span></div>{enabled && !connected ? <button type="button" onClick={onReconnect} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.08] hover:text-white" aria-label="Reconnect live updates"><RotateCcw className="h-3.5 w-3.5" /></button> : null}</div>;
}

function TransitionFeed({ transitions, selectedRunId, onSelect }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Live transition feed</p><p className="mt-1 text-xs text-slate-500">WebSocket progress; durable APIs remain authoritative</p></div><Radio className="h-5 w-5 text-cyan-300" /></div><div className="mt-4 space-y-2.5">{transitions.length ? transitions.map((event, index) => <button key={`${event.runId}-${event.sequence}-${index}`} type="button" onClick={() => onSelect(event.runId)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedRunId === event.runId ? 'border-cyan-300/30 bg-cyan-300/[0.08]' : 'border-white/[0.08] bg-black/10 hover:border-white/20 hover:bg-white/[0.04]'}`}><span className={`h-2 w-2 shrink-0 rounded-full ${stateMeta[event.state]?.tone || 'bg-slate-400'}`} /><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs text-slate-200">{event.runId.slice(0, 16)}</p><p className="mt-1 text-[11px] text-slate-500">{stateMeta[event.state]?.label || event.state} · {formatTimestamp(event.occurredAt)}</p></div><ChevronRight className="h-4 w-4 text-slate-500" /></button>) : <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-xs leading-5 text-slate-500">New run-state transitions will appear here when live mode is enabled.</div>}</div></article>;
}

export default function EnterpriseDashboard({ refreshSignal = 0, executionEvent = null, focusedRunId = null, streamStatus = 'disabled', liveTransitions = [], onReconnect, onRunSelected }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(focusedRunId);
  const [selectedRun, setSelectedRun] = useState(null);

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
      setDashboard(await response.json());
      setError(null);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(loadError.message || 'Operations data is currently unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestHeaders]);

  const loadRun = useCallback(async runId => {
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

  const states = dashboard?.states || {};
  const inFlight = (states.requested || 0) + (states.validated || 0) + (states.queued || 0) + (states.assigned || 0) + (states.running || 0) + (states.collecting_artifacts || 0);
  const terminal = (states.passed || 0) + (states.failed || 0) + (states.cancelled || 0);
  const recentRuns = dashboard?.recentRuns || [];
  const stateEntries = Object.entries(states).filter(([, value]) => value > 0);
  const maxStateCount = Math.max(1, ...stateEntries.map(([, value]) => value));
  const activeEvent = liveTransitions[0] || executionEvent?.payload || executionEvent?.result || executionEvent;

  return <section aria-label="Atom operations dashboard" className="mb-8 overflow-hidden rounded-3xl border border-slate-700/80 bg-[#0b1120] text-slate-100 shadow-[0_28px_80px_-35px_rgba(15,23,42,0.9)]">
    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_78%_5%,rgba(34,211,238,0.16),transparent_27%),radial-gradient(circle_at_4%_78%,rgba(139,92,246,0.14),transparent_30%)] px-5 py-5 sm:px-7"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="max-w-xl"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200"><CircleDot className="h-3.5 w-3.5" />Tenant operations</div><h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Execution control room</h2><p className="mt-2 text-sm leading-6 text-slate-400">Live run posture, durable evidence, and policy guardrails. WebSocket updates are reconciled against the secured Atom API.</p></div><div className="flex flex-wrap items-center gap-3"><LiveStatus status={streamStatus} onReconnect={onReconnect} /><div className="hidden text-right sm:block"><p className="text-xs text-slate-500">Last synchronized</p><p className="mt-1 text-xs font-medium text-slate-300">{lastUpdated ? formatTimestamp(lastUpdated) : 'Awaiting data'}</p></div><button type="button" onClick={() => load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></div></div></div>
    <div className="p-5 sm:p-7">{error ? <div role="alert" className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><p className="font-medium">Dashboard connection requires attention</p><p className="mt-1 text-amber-100/70">{error}</p><button type="button" onClick={() => { setError(null); load(); }} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 underline underline-offset-4">Retry connection <ArrowUpRight className="h-3.5 w-3.5" /></button></div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={Activity} label="All runs" value={loading ? '—' : dashboard?.totalRuns ?? 0} helper="Tenant-scoped history" /><MetricCard icon={TrendingUp} label="Success rate" value={loading ? '—' : `${dashboard?.successRate ?? 0}%`} helper={`${terminal} completed run${terminal === 1 ? '' : 's'}`} accent="text-emerald-300" /><MetricCard icon={LoaderCircle} label="In flight" value={loading ? '—' : inFlight} helper="Queued, assigned, or running" accent="text-amber-200" /><MetricCard icon={TimerReset} label="Avg. duration" value={loading ? '—' : formatDuration(dashboard?.averageDurationMs)} helper="Terminal runs only" accent="text-violet-300" /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]"><article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">Execution pulse</p><p className="mt-1 text-xs text-slate-500">Live state distribution in the durable run ledger</p></div><Gauge className="h-5 w-5 text-cyan-300" /></div><div className="mt-5 space-y-3">{stateEntries.length ? stateEntries.map(([state, count]) => <div key={state} className="grid grid-cols-[118px_minmax(0,1fr)_30px] items-center gap-3"><StatePill state={state} /><div className="h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className={`${stateMeta[state]?.tone || 'bg-slate-400'} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(7, (count / maxStateCount) * 100)}%` }} /></div><span className="text-right text-xs tabular-nums text-slate-300">{count}</span></div>) : <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">No run activity yet. Submit an approved test to populate this view.</div>}</div></article>
      <article className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-violet-400/[0.08] p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Latest execution signal</p><p className="mt-1 text-xs text-slate-400">A safe live transition; detailed evidence stays permission scoped</p></div><Bot className="h-5 w-5 text-cyan-200" /></div>{activeEvent?.state || activeEvent?.status ? <div className="mt-5"><StatePill state={activeEvent.state || activeEvent.status} /><p className="mt-4 text-sm font-medium text-slate-100">{activeEvent.runId ? `Run ${String(activeEvent.runId).slice(0, 12)} updated` : 'Execution update received'}</p><p className="mt-1 text-xs leading-5 text-slate-400">{activeEvent.occurredAt ? `Received ${formatTimestamp(activeEvent.occurredAt)}.` : 'The dashboard will reconcile against the tenant run ledger.'}</p></div> : <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-slate-400">Enable live mode to receive state transitions; manual refresh remains the fallback.</div>}</article></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]"><article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]"><div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-5"><div><p className="text-sm font-semibold text-white">Recent runs</p><p className="mt-1 text-xs text-slate-500">Select a run to subscribe to its authorized lifecycle channel</p></div><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-slate-400">{recentRuns.length} visible</span></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-black/10 text-[10px] uppercase tracking-[0.13em] text-slate-500"><tr><th className="px-4 py-3 font-medium sm:px-5">Run</th><th className="px-4 py-3 font-medium">State</th><th className="px-4 py-3 font-medium">Submitted</th><th className="px-4 py-3 text-right font-medium sm:px-5">Duration</th></tr></thead><tbody>{recentRuns.length ? recentRuns.map(run => <tr key={run.id} onClick={() => { setSelectedRunId(run.id); onRunSelected?.(run.id); }} className={`cursor-pointer border-t border-white/[0.07] transition hover:bg-white/[0.035] ${selectedRunId === run.id ? 'bg-cyan-300/[0.07]' : ''}`}><td className="px-4 py-3.5 font-mono text-xs text-cyan-100 sm:px-5">{String(run.id).slice(0, 12)}</td><td className="px-4 py-3.5"><StatePill state={run.state} /></td><td className="px-4 py-3.5 text-xs text-slate-400">{formatTimestamp(run.created_at || run.createdAt)}</td><td className="px-4 py-3.5 text-right text-xs tabular-nums text-slate-300 sm:px-5">{formatDuration(run.result?.duration)}</td></tr>) : <tr><td colSpan="4" className="px-5 py-10 text-center text-sm text-slate-500">No durable run records are available for this tenant.</td></tr>}</tbody></table></div>{selectedRun ? <div className="border-t border-white/10 bg-black/10 px-4 py-3 text-xs text-slate-400 sm:px-5"><span className="font-medium text-slate-200">Focused run:</span> <span className="font-mono">{String(selectedRun.id).slice(0, 16)}</span> <span className="mx-2 text-slate-600">·</span><StatePill state={selectedRun.state} /></div> : null}</article><TransitionFeed transitions={liveTransitions} selectedRunId={selectedRunId} onSelect={runId => { setSelectedRunId(runId); onRunSelected?.(runId); }} /></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]"><article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Live delivery model</p><p className="mt-1 text-xs text-slate-500">Transition events are low-sensitivity invalidations, not evidence payloads</p></div><Signal className="h-5 w-5 text-cyan-300" /></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">1. Receive</p><p className="mt-2 text-sm font-medium text-slate-100">Validate sequence</p></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">2. Reconcile</p><p className="mt-2 text-sm font-medium text-slate-100">Refetch durable state</p></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">3. Recover</p><p className="mt-2 text-sm font-medium text-slate-100">Replay on reconnect</p></div></div></article><article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Guardrail posture</p><p className="mt-1 text-xs text-slate-500">Controls applied before execution and live delivery</p></div><ShieldCheck className="h-5 w-5 text-emerald-300" /></div><div className="mt-4 space-y-2.5"><Guardrail icon={ShieldCheck} label="Tenant boundary" detail="Dashboard events are tenant scoped and permission gated." /><Guardrail icon={KeyRound} label="Approval binding" detail="High-risk execution remains bound to policy and intent." /><Guardrail icon={Database} label="Durable evidence" detail="Run details and artifacts are fetched through authorized APIs." /><Guardrail icon={XCircle} label="Remote egress" detail="Fail-closed until the managed egress gate is satisfied." status="Gated" /></div></article></div>
    </div>
  </section>;
}
