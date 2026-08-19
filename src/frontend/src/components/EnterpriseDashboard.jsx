import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, ListChecks, RefreshCw, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const requestHeaders = {
  ...(import.meta.env.VITE_DEV_USER ? { 'X-Dev-User': import.meta.env.VITE_DEV_USER } : {}),
  ...(import.meta.env.VITE_DEV_TENANT_ID ? { 'X-Tenant-Id': import.meta.env.VITE_DEV_TENANT_ID } : {})
};

function Metric({ icon, label, value, tone = 'text-slate-700' }) {
  const MetricIcon = icon;
  return <div className="rounded-lg border bg-white/70 p-3 dark:bg-slate-900/50"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MetricIcon className="h-4 w-4" />{label}</div><div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div></div>;
}

export default function EnterpriseDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/dashboard`, { headers: requestHeaders });
      if (!response.ok) throw new Error('Dashboard unavailable');
      setDashboard(await response.json()); setError(null);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const states = dashboard?.states || {};
  return <Card className="mb-8 border-0 bg-white/80 shadow-lg dark:bg-slate-800/80">
    <CardHeader className="flex-row items-center justify-between pb-3">
      <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-blue-600" />Operations dashboard</CardTitle>
      <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
    </CardHeader>
    <CardContent>
      {error ? <p className="text-sm text-muted-foreground">{error}. Configure authentication and the dashboard API to view tenant metrics.</p> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric icon={ListChecks} label="Total runs" value={dashboard?.totalRuns ?? '—'} />
          <Metric icon={CheckCircle2} label="Success rate" value={dashboard ? `${dashboard.successRate}%` : '—'} tone="text-emerald-600" />
          <Metric icon={Clock3} label="Queued / running" value={`${(states.queued || 0) + (states.running || 0)}`} tone="text-amber-600" />
          <Metric icon={XCircle} label="Failed" value={states.failed || 0} tone="text-rose-600" />
        </div>
        {dashboard?.recentRuns?.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="py-2">Run</th><th>State</th><th>Created</th><th>Duration</th></tr></thead><tbody>{dashboard.recentRuns.map(run => <tr key={run.id} className="border-b last:border-0"><td className="py-2 font-mono text-xs">{run.id.slice(0, 8)}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-700">{run.state}</span></td><td className="text-muted-foreground">{new Date(run.created_at).toLocaleString()}</td><td className="text-muted-foreground">{run.result?.duration ? `${run.result.duration} ms` : '—'}</td></tr>)}</tbody></table></div>}
      </>}
    </CardContent>
  </Card>;
}
