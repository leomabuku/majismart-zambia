import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Download, RefreshCw, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { reportAnalyticsCsv } from '../services/reportAnalyticsCsv';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const categories = ['WATER_SHORTAGE', 'PIPE_LEAKAGE', 'BURST_PIPE', 'TANK_MALFUNCTION', 'WATER_QUALITY', 'OTHER'];
const label = text => text.toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const day = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lusaka', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(value));
const preset = count => ({ start: day(Date.now() - (count - 1) * 86400000), end: day(Date.now()) });

function Breakdown({ title, rows, total }) {
  return <section className="stat-card report-panel">
    <h3>{title}</h3>
    <table className="report-breakdown">
      <thead><tr><th scope="col">{title === 'Current report status' ? 'Status' : 'Category'}</th><th scope="col">Reports</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.label}>
        <th scope="row">{label(row.label)}<span className="report-bar-track" aria-hidden="true"><span style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></span></th>
        <td>{row.count}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}

export default function ReportAnalytics() {
  const { isAdmin, user } = useAuth();
  const [filters, setFilters] = useState(() => ({ ...preset(30), category: 'ALL' }));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setData(null);
    setError('');
    if (!isAdmin) return;
    if (!filters.start || !filters.end) {
      setError('Choose both a start date and an end date.');
      setLoading(false);
      return;
    }
    let active = true;
    let controller;
    let debounce;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      setLoading(true);
      try {
        const response = await api.get(`/reports/analytics?${new URLSearchParams(filters)}`, { signal: request.signal });
        if (!active || request.signal.aborted) return;
        if (!response.success) throw new Error(response.error || 'Unable to load report analytics.');
        setData(response.data); setError('');
      } catch (failure) {
        if (active && !request.signal.aborted) setError(failure.message || 'Unable to load report analytics.');
      } finally { if (active && !request.signal.aborted) setLoading(false); }
    };
    void refresh();
    const stop = api.subscribeRealtime(event => {
      if (event === 'REPORT_CREATED' || event === 'REPORT_STATUS_CHANGED') {
        clearTimeout(debounce); debounce = setTimeout(refresh, 300);
      }
    }, connected => { if (connected) void refresh(); });
    const timer = setInterval(refresh, 30000);
    return () => { active = false; controller?.abort(); clearTimeout(debounce); clearInterval(timer); stop(); };
  }, [filters, isAdmin, user?.id, revision]);

  if (!isAdmin) return <div role="alert" className="stat-card">Sign in as an administrator to view report analytics.</div>;

  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([reportAnalyticsCsv(data)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `MajiSmart-report-analytics-${data.filters.start}-${data.filters.end}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="report-analytics" aria-busy={loading}>
    <div className="report-heading">
      <div><h2><BarChart3 size={22} aria-hidden="true" /> Report analytics</h2><p>Understand reported water issues and the progress of your response.</p></div>
      <div className="report-actions">
        <button className="btn-secondary" onClick={() => setRevision(r => r + 1)} disabled={loading}><RefreshCw size={15} /> Refresh</button>
        <button className="btn-primary" onClick={download} disabled={!data || Boolean(error)}><Download size={15} /> Export CSV</button>
      </div>
    </div>
    <div className="report-filters stat-card">
      <label>Submitted from<input type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} /></label>
      <label>Through<input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} /></label>
      <label>Category<select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
        <option value="ALL">All categories</option>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}
      </select></label>
      <div className="report-presets" aria-label="Date presets">{[7, 30, 90].map(count => <button key={count} className="btn-secondary" onClick={() => setFilters(f => ({ ...f, ...preset(count) }))}>{count} days</button>)}</div>
    </div>
    <p className="report-note">Dates use Zambia time. Counts show the current status of reports submitted in the selected period, including rejected reports.</p>
    {loading && !data && <p role="status">Loading report analytics…</p>}
    {error && <p role="alert" className="report-error">{error} {data ? 'The figures below are from the last successful refresh.' : ''}</p>}
    {data && <>
      <div className="report-kpis">
        {[
          ['Reports submitted', data.total], ['Currently open', data.open], ['Resolved', data.resolved],
          ['Resolved share', data.resolution_rate_percent === null ? '—' : `${data.resolution_rate_percent}%`],
          ['Open over 48 hours', data.open_age.over_48h],
          ['Average resolution', data.average_resolution_hours === null ? '—' : `${data.average_resolution_hours} h`]
        ].map(([title, value]) => <section key={title} className="stat-card"><p className="report-kpi-label">{title}</p><strong className="report-kpi-value">{value}</strong></section>)}
      </div>
      <p className="report-note">Resolution time: submission to the latest recorded resolution for currently resolved reports. Sample: {data.resolution_sample_size} of {data.resolved} resolved reports. Missing history is excluded.</p>
      {data.total === 0 && <div className="stat-card report-empty">No reports were submitted in this period for the selected category.</div>}
      <section className="stat-card report-panel">
        <h3>Daily report submissions</h3>
        <div className="report-trend"><Line role="img" aria-label="Daily report submission counts. Exact values are in the table below." data={{
          labels: data.daily_submissions.map(d => d.date),
          datasets: [{ label: 'Reports submitted', data: data.daily_submissions.map(d => d.count), borderColor: '#0077B6', backgroundColor: '#0077B6', pointRadius: data.daily_submissions.length > 31 ? 0 : 3, tension: 0.2 }]
        }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxTicksLimit: 8 } } } }} /></div>
        <details><summary>View daily counts</summary><div className="report-table-scroll"><table className="data-table"><thead><tr><th scope="col">Date (Zambia)</th><th scope="col">Reports</th></tr></thead><tbody>{data.daily_submissions.map(d => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.count}</td></tr>)}</tbody></table></div></details>
      </section>
      <div className="report-two-column"><Breakdown title="Current report status" rows={data.statuses} total={data.total} /><Breakdown title="Issue categories" rows={data.categories} total={data.total} /></div>
      <div className="report-two-column">
        <section className="stat-card report-panel"><h3>Age of currently open reports</h3><p className="report-note">Age is measured from submission. A 48-hour age is a review flag, not a contractual SLA.</p><table className="report-breakdown"><thead><tr><th scope="col">Age</th><th scope="col">Reports</th></tr></thead><tbody>{[['Under 24 hours', data.open_age.under_24h], ['24–48 hours', data.open_age.from_24_to_48h], ['Over 48 hours', data.open_age.over_48h]].map(([name, count]) => <tr key={name}><th scope="row">{name}</th><td>{count}</td></tr>)}</tbody></table></section>
        <section className="stat-card report-panel"><h3>Locations needing attention</h3><p className="report-note">Top 10 by open reports. Grouped by station, otherwise the reported location.</p><div className="report-table-scroll"><table className="report-breakdown"><thead><tr><th scope="col">Station / location</th><th scope="col">Total</th><th scope="col">Open</th></tr></thead><tbody>{data.locations.map(l => <tr key={l.location}><th scope="row">{l.location}</th><td>{l.total}</td><td>{l.open}</td></tr>)}</tbody></table></div></section>
      </div>
      <p className="report-note" role="status">Last updated: {new Date(data.generated_at).toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })} (Zambia). Refreshes on report events and every 30 seconds.</p>
    </>}
  </div>;
}
