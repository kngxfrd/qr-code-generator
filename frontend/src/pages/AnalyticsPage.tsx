import { useEffect, useState } from 'react';
import { ArrowDownToLine, BarChart3, LockKeyhole, MapPin, Smartphone } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { Button, EmptyState, PageHeading } from '../components/ui';
import type { Analytics } from '../types';

export function AnalyticsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    api<Analytics>('/api/analytics/summary').then(setData).catch((error: Error) => {
      if (error.message.toLowerCase().includes('subscription')) setLocked(true); else notify(error.message, 'error');
    }).finally(() => setLoading(false));
  }, []);
  const exportCsv = async () => {
    try {
      const response = await fetch('/api/analytics/export', { credentials: 'same-origin' });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Export is unavailable on this plan.'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'free-qr-scans.csv'; a.click(); URL.revokeObjectURL(url);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not export scans.', 'error'); }
  };
  return <><PageHeading eyebrow="MEASURE WHAT MATTERS" title="Analytics" description="A clear picture of how your dynamic QR codes are being used." action={data && user?.subscription.planId === 'pro' ? <Button variant="secondary" icon={<ArrowDownToLine size={16} />} onClick={() => void exportCsv()}>Export CSV</Button> : undefined} />
    {loading ? <div className="loading-state"><span className="spinner" />Loading analytics…</div> : locked || !data ? <div className="analytics-lock"><div className="lock-mark"><LockKeyhole size={25} /></div><p className="eyebrow">PAID PLAN FEATURE</p><h2>Analytics come with dynamic QR codes.</h2><p>Upgrade to create editable QR codes and see scan counts, scan dates, devices and broad country trends. Static QR codes are available in one-time packs.</p><Button onClick={() => window.location.assign('/billing')}>See plans <span>→</span></Button></div> : <>
      <div className="metric-grid"><article className="metric-card"><span>Scans this month</span><strong>{data.totalScans.toLocaleString()}</strong><small>Across your account</small></article><article className="metric-card"><span>Dynamic codes</span><strong>{data.dynamicCodes}</strong><small>Codes that can be edited</small></article><article className="metric-card"><span>All saved codes</span><strong>{data.totalCodes}</strong><small>Static and dynamic</small></article></div>
      <div className="analytics-grid"><section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">LAST 30 DAYS</p><h2>Scan activity</h2></div><BarChart3 size={19} /></div><div className="bar-chart" role="img" aria-label="Daily QR scans over the last 30 days">{data.dailyScans.map((day) => { const max = Math.max(1, ...data.dailyScans.map((item) => item.count)); return <div className="bar-column" key={day.date} title={`${day.count} scans · ${day.date}`}><span style={{ height: `${Math.max(3, day.count / max * 100)}%` }} /><small>{new Date(day.date).getDate() % 5 === 0 ? new Date(day.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</small></div>; })}</div><div className="chart-axis"><span>30 days ago</span><span>Today</span></div></section>
      <section className="panel breakdown-panel"><div className="panel-heading"><div><p className="eyebrow">WHERE</p><h2>Top countries</h2></div><MapPin size={19} /></div>{data.countries.length ? <Breakdown items={data.countries.slice(0, 6)} /> : <p className="quiet-empty">Scan trends will appear here when a code is scanned.</p>}</section>
      <section className="panel breakdown-panel"><div className="panel-heading"><div><p className="eyebrow">HOW</p><h2>Devices</h2></div><Smartphone size={19} /></div>{data.devices.length ? <Breakdown items={data.devices} /> : <p className="quiet-empty">No device data yet.</p>}</section>
      <section className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">LATEST</p><h2>Recent scans</h2></div></div>{data.recentScans.length ? <div className="recent-table">{data.recentScans.map((scan) => <div key={scan.id}><strong>{scan.codeName}</strong><span>{scan.device}</span><span>{scan.country}</span><time>{new Date(scan.createdAt).toLocaleString()}</time></div>)}</div> : <EmptyState title="No scans yet" description="Your recent scan activity will show up here." />}</section></div>
    </>}
  </>;
}

function Breakdown({ items }: { items: { value: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return <div className="breakdown-list">{items.map((item) => <div className="breakdown-row" key={item.value}><div><span>{item.value}</span><b>{item.count}</b></div><i><span style={{ width: `${item.count / max * 100}%` }} /></i></div>)}</div>;
}
