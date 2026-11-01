import React, { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Download, RefreshCw, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import { reportCsv } from '../services/reportCsv';
import TelemetryIntelligence from '../components/TelemetryIntelligence';

ChartJS.register(CategoryScale,LinearScale,PointElement,LineElement,BarElement,ArcElement,Tooltip,Legend);
const label = value => String(value || 'Unspecified').toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const number = value => value==null ? '—' : Number(value).toFixed(1);
const colors=['#0077B6','#14B8A6','#F59E0B','#6366F1','#EF4444','#94A3B8','#0891B2','#8B5CF6','#84CC16','#F97316'];
const categories=['WATER_SHORTAGE','PIPE_LEAKAGE','BURST_PIPE','LOW_PRESSURE','WATER_INTERRUPTION','DAMAGED_INFRASTRUCTURE','MONITORING_FAULT','TANK_MALFUNCTION','WATER_QUALITY','OTHER'];

function Graph({title,rows,type='bar',note}) {
  const source=rows.slice(0,12);
  const data={labels:source.map(row=>type==='doughnut'?`${label(row.label)} (${row.count})`:label(row.label)),datasets:[{label:'Reports',data:source.map(row=>row.count),backgroundColor:type==='doughnut'?colors:'#0077B6',borderRadius:4}]};
  return <section className="insight-panel"><h3>{title}</h3>{note&&<p className="insight-note">{note}</p>}
    <div className="insight-chart">{source.some(r=>r.count>0)?type==='doughnut'?<Doughnut data={data} options={{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{position:'bottom'}}}} aria-label={title} role="img"/>:<Bar data={data} options={{responsive:true,maintainAspectRatio:false,animation:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}} aria-label={title} role="img"/>:<p>No observations for this selection.</p>}</div>
    <details><summary>View exact counts</summary><div className="insight-scroll"><table><thead><tr><th scope="col">Group</th><th scope="col">Reports</th></tr></thead><tbody>{rows.map(row=><tr key={row.label||'unspecified'}><th scope="row">{label(row.label)}</th><td>{row.count}</td></tr>)}</tbody></table></div></details>
  </section>;
}

const sections = ['Overview', 'Issues', 'Response', 'Locations', 'Reports'];

function DailyTrend({ rows }) {
  return <section className="insight-panel"><h3>Reports over time</h3>
    <div className="insight-chart"><Line data={{ labels: rows.map(r => new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Africa/Lusaka' })), datasets: [
      { label: 'New reports', data: rows.map(r => r.submitted), borderColor: '#0077B6', tension: .2, pointRadius: 0 },
      { label: 'Resolved', data: rows.map(r => r.resolved), borderColor: '#14B8A6', tension: .2, pointRadius: 0 }
    ] }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { maxTicksLimit: 7 } } } }} role="img" aria-label="Daily new reports and resolutions" /></div>
    <details><summary>View daily figures</summary><div className="insight-scroll"><table><thead><tr><th>Date</th><th>New</th><th>Resolved</th></tr></thead><tbody>{rows.map(r => <tr key={r.date}><th>{r.date}</th><td>{r.submitted}</td><td>{r.resolved}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function MiniBreakdown({ title, rows, onDetails, action }) {
  const maximum = Math.max(1, ...rows.map(r => r.count));
  return <section className="insight-panel insight-mini"><h3>{title}</h3>
    {rows.length ? rows.slice(0, 3).map(r => <div className="insight-mini-row" key={r.label || 'none'}>
      <span>{label(r.label)}</span><strong>{r.count}</strong>
      <div className="insight-mini-track" aria-hidden="true"><i style={{ width: `${r.count / maximum * 100}%` }} /></div>
    </div>) : <p className="insight-note">No matching reports.</p>}
    <button className="insight-link" onClick={onDetails}>{action} →</button>
  </section>;
}

export default function ReportAnalytics({ stations = [] }) {
  const [filters, setFilters] = useState({ dataset: 'october-demo', from: '2026-10-01', to: '2026-10-31', category: '', status: '', station: '', location: '' });
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [view, setView] = useState('Overview'), [showFilters, setShowFilters] = useState(false), [showAnalysis, setShowAnalysis] = useState(false), [showActions, setShowActions] = useState(false);
  const [page, setPage] = useState(0), [selected, setSelected] = useState(null);
  const scope = useRef(''), dialog = useRef(null);
  useEffect(() => {
    let active = true;
    const nextScope = JSON.stringify(filters);
    if (scope.current !== nextScope) { setResult(null); setSelected(null); setPage(0); scope.current = nextScope; }
    setLoading(true);
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    api.get(`/analytics/reports?${query}`).then(res => {
      if (!active) return;
      const compatible = res.success && Array.isArray(res.data?.records) && res.data.dataset === filters.dataset;
      setLoading(false);
      setError(compatible ? '' : res.error || 'The analysis service is updating. Please retry shortly.');
      if (compatible) setResult(res.data);
    });
    return () => { active = false; };
  }, [filters, revision]);
  useEffect(() => {
    let timer, lastSync = 0;
    const stop = api.subscribeRealtime(event => {
      if (event === 'SYNC') { if (Date.now() - lastSync < 15000) return; lastSync = Date.now(); }
      if (['SYNC', 'REPORT_CREATED', 'REPORT_STATUS_CHANGED'].includes(event)) {
        clearTimeout(timer); timer = setTimeout(() => setRevision(v => v + 1), 150);
      }
    });
    return () => { clearTimeout(timer); stop(); };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (selected && node && !node.open) node.showModal();
    return () => { if (node?.open) node.close(); };
  }, [selected]);
  const set = e => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  const changeDataset = e => {
    const demo = e.target.value === 'october-demo';
    setFilters({ dataset: e.target.value, from: demo ? '2026-10-01' : '', to: demo ? '2026-10-31' : '', category: '', status: '', station: '', location: '' });
    setView('Overview');
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportCsv(result)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `MajiSmart-${filters.dataset}-${filters.from || 'all'}-${filters.to || 'current'}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const rows = result?.records || [];
  const demo = filters.dataset === 'october-demo';
  const locations = result?.hotspots || [], categoriesInResult = result?.categories || [];
  const matrixMaximum = Math.max(1, ...categoriesInResult.flatMap(c => locations.map(l => rows.filter(r => r.location === l.label && r.category === c.label).length)));
  const go = section => { setView(section); setSelected(null); };
  const applied = [['category', 'Issue', filters.category], ['status', 'Status', filters.status], ['station', 'Station', filters.station ? stations.find(s => s.id === filters.station)?.name || filters.station : ''], ['location', 'Location', filters.location]].filter(([, , value]) => value);
  const actions = showActions ? result?.recommendations || [] : (result?.recommendations || []).slice(0, 2);
  return <div className="insights insight-compact">
    <div className="insight-heading"><div><p className="insight-eyebrow">Reports & service performance</p><h1>Report overview</h1><p>The key issues, progress and next actions in one place.</p></div>
      <div className="insight-actions"><button className="btn-secondary" aria-label="Refresh report analysis" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={15} /></button><button className="btn-secondary" disabled={!result} onClick={download}><Download size={15} /> Export CSV</button></div>
    </div>
    <div className="insight-toolbar">
      <label>Data source<select aria-label="Data source" value={filters.dataset} onChange={changeDataset}><option value="october-demo">October 2026 · Demo</option><option value="operational">Operational submissions</option></select></label>
      <span className="insight-period">{filters.from || 'All dates'}{filters.to ? ` — ${filters.to}` : ''}</span>
      <button className="btn-secondary" aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}>Filters {showFilters ? '−' : '+'}</button>
      <span className="insight-update" role="status">{loading ? 'Updating…' : demo ? 'Historical snapshot' : 'Updates on report activity'}</span>
    </div>
    {applied.length > 0 && <div className="insight-applied" aria-label="Applied report filters"><span>Filtered by:</span>{applied.map(([key, title, value]) => <span className="insight-filter-chip" key={key}>{title}: {key === 'category' || key === 'status' ? label(value) : value}</span>)}<button className="insight-link" onClick={() => setFilters(f => ({ ...f, category: '', status: '', station: '', location: '' }))}>Clear filters</button></div>}
    {showFilters && <section className="insight-filters insight-panel" aria-label="Report filters">
      <label>Submitted from<input type="date" name="from" value={filters.from} onChange={set} /></label><label>Through<input type="date" name="to" value={filters.to} onChange={set} /></label>
      <label>Issue<select name="category" value={filters.category} onChange={set}><option value="">All issues</option>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
      <label>Status<select name="status" value={filters.status} onChange={set}><option value="">All statuses</option>{['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
      <label>Station<select name="station" value={filters.station} onChange={set}><option value="">All stations</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Location<input name="location" value={filters.location} onChange={set} placeholder="e.g. Mtendere" /></label>
    </section>}
    <div className="insight-source-note">{demo ? <><strong>Demo data</strong> · Fictional reports and admin responses. October snapshot; separate from operational totals.</> : <>Operational reports · Some submissions have not yet been verified.</>}</div>
    <nav className="insight-tabs" aria-label="Report analysis sections">{sections.map(section => <button key={section} aria-pressed={view === section} className={view === section ? 'selected' : ''} onClick={() => go(section)}>{section}</button>)}</nav>
    {error && <p role="alert" className="insight-caution">{error}</p>}
    {loading && !result ? <p role="status">Loading report summary…</p> : result && <>
      <div className="insight-kpis">{[
        ['Total reports', result.total, result.unique_demo_residents == null ? 'Selected submissions' : `${result.unique_demo_residents} fictional residents`],
        ['Still open', result.open, `${result.urgent_open} high / critical`],
        ['Resolved', result.statuses.RESOLVED || 0, result.resolution.rate_percent == null ? 'No eligible reports' : `${number(result.resolution.rate_percent)}% resolved, excluding rejected`],
        ['Typical response', result.response.median_hours == null ? '—' : `${number(result.response.median_hours)} h`, 'Median first admin response']
      ].map(([title, value, subtitle]) => <section className="insight-panel" key={title}><span>{title}</span><strong>{value}</strong><small>{subtitle}</small></section>)}</div>
      {view === 'Overview' && <>
        <div className="insight-takeaway"><div><strong>{result.urgent_open ? `${result.urgent_open} urgent open reports need review` : 'No high-severity open reports in this selection'}</strong><p>{categoriesInResult[0] ? `${label(categoriesInResult[0].label)} leads with ${categoriesInResult[0].count} reports. ` : ''}{result.response.unanswered} reports have no recorded admin response.</p></div><button className="insight-link" onClick={() => go('Response')}>View response details →</button></div>
        <div className="insight-grid insight-overview-charts"><DailyTrend rows={result.daily_workload || []} /><Graph title="Report progress" type="doughnut" rows={Object.entries(result.statuses).map(([label, count]) => ({ label, count }))} /></div>
        <div className="insight-topics"><MiniBreakdown title="Most reported issues" rows={result.categories} onDetails={() => go('Issues')} action="View issue details" /><MiniBreakdown title="Most reported locations" rows={result.locations} onDetails={() => go('Locations')} action="View location details" />
          <section className="insight-panel insight-mini"><h3>Response performance</h3><strong className="insight-response-rate">{number(result.response.within_24h_percent)}{result.response.within_24h_percent == null ? '' : '%'}</strong><p className="insight-note">of timed admin responses within 24 hours</p><div className="insight-mini-track" aria-hidden="true"><i style={{ width: `${result.response.within_24h_percent || 0}%` }} /></div><button className="insight-link" onClick={() => go('Response')}>View timing details →</button></section>
        </div>
        <section className="insight-panel insight-brief"><div className="insight-section-heading"><h3>Recommended focus</h3><button className="insight-link" onClick={() => setShowActions(v => !v)}>{showActions ? 'Show less' : 'View all actions'}</button></div><div className="insight-recommendations">{actions.map(r => <article key={r.title}><span>{r.priority}</span><h3>{r.title}</h3><p>{r.evidence}</p><details><summary>Read recommended action</summary><p>{r.action}</p></details></article>)}</div>
          <details className="insight-read-more" open={showAnalysis} onToggle={e => setShowAnalysis(e.currentTarget.open)}><summary>Read the full written analysis</summary>{result.summaries.map((text, i) => <p key={i}>{text}</p>)}</details>
        </section>
      </>}
      {view === 'Issues' && <>
        <div className="insight-grid"><Graph title="Reported issues" rows={result.categories} /><Graph title="Admin-assessed severity" rows={result.severities} /></div>
        <details className="insight-panel"><summary>View causes, actions and outcomes</summary><div className="insight-grid"><Graph title="Recorded causes" rows={result.causes} /><Graph title="Latest action per report" rows={result.actions} /><Graph title="Latest outcome" rows={result.outcomes} /></div></details>
        <details className="insight-panel"><summary>View category performance figures</summary><div className="insight-scroll"><table><thead><tr><th>Issue</th><th>Reports</th><th>Open</th><th>Resolved</th><th>Resolution rate</th><th>Mean resolution</th></tr></thead><tbody>{result.category_performance.map(c => <tr key={c.label}><th>{label(c.label)}</th><td>{c.count}</td><td>{c.open}</td><td>{c.resolved}</td><td>{number(c.resolution_rate_percent)}%</td><td>{number(c.mean_resolution_hours)} h</td></tr>)}</tbody></table></div></details>
      </>}
      {view === 'Response' && <>
        <p className="insight-note">{result.response.observations} timed responses · {result.response.unanswered} without a recorded response · {result.resolution.observations} timed resolutions.</p>
        <div className="insight-grid"><Graph title="First admin response" rows={result.duration_bands.first_response} note={`Median ${number(result.response.median_hours)} h · 90th percentile ${number(result.response.p90_hours)} h`} /><Graph title="Time to resolution" rows={result.duration_bands.resolution} note={`Median ${number(result.resolution.median_hours)} h · 90th percentile ${number(result.resolution.p90_hours)} h`} /></div>
        <details className="insight-panel"><summary>View the age of open reports</summary><Graph title="Open-report age" rows={Object.entries(result.open_age).map(([key, count]) => ({ label: ({ under_24h: 'Under 24 hours', from_24_to_48h: '24–48 hours', from_48h_to_7d: '2–7 days', over_7d: 'Over 7 days' })[key], count }))} /></details>
      </>}
      {view === 'Locations' && <>
        <Graph title="Reports by location" rows={result.locations} />
        <details className="insight-panel"><summary>View location × fault comparison</summary><div className="insight-scroll"><table className="insight-matrix"><thead><tr><th>Issue</th>{locations.map(l => <th key={l.label}>{l.label}</th>)}</tr></thead><tbody>{categoriesInResult.map(c => <tr key={c.label}><th>{label(c.label)}</th>{locations.map(l => { const count = rows.filter(r => r.location === l.label && r.category === c.label).length; return <td key={l.label} style={{ background: `rgba(0,119,182,${count ? .08 + .5 * count / matrixMaximum : 0})` }}>{count}</td>; })}</tr>)}</tbody></table></div></details>
      </>}
      {view === 'Reports' && <section className="insight-panel"><div className="insight-section-heading"><h3>Individual reports</h3><span className="insight-note">{rows.length} matching reports</span></div><div className="insight-scroll"><table><thead><tr><th>Report</th><th>Location</th><th>Issue</th><th>Status</th><th>Response</th><th>Details</th></tr></thead><tbody>{rows.slice(page * 20, page * 20 + 20).map(r => <tr key={r.id}><th>{r.id}<small>{new Date(r.created_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Lusaka' })}</small></th><td>{r.location}</td><td>{label(r.category)}</td><td>{label(r.status)}</td><td>{number(r.first_response_hours)} h</td><td><button className="insight-link" onClick={() => setSelected(r)}>View details</button></td></tr>)}</tbody></table></div><div className="insight-pagination"><button className="btn-secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><span>{rows.length ? `${page * 20 + 1}–${Math.min((page + 1) * 20, rows.length)} of ${rows.length}` : 'No matching reports'}</span><button className="btn-secondary" disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage(p => p + 1)}>Next</button></div></section>}
      <details className="insight-methodology"><summary>About these figures</summary><p>{result.definitions.cohort} {result.definitions.resolution} {result.definitions.causality} Review bands are not contractual service levels. Demo data is fictional. Operational reports with UNKNOWN provenance are unverified.</p>{!demo && <TelemetryIntelligence from={filters.from} to={filters.to} />}</details>
    </>}
    {selected && <dialog ref={dialog} className="insight-dialog" onCancel={() => setSelected(null)} aria-labelledby="report-detail-title"><div className="insight-section-heading"><h2 id="report-detail-title">Report details</h2><button className="btn-secondary" onClick={() => setSelected(null)} autoFocus>Close details</button></div><p className="insight-note">{selected.id} · {selected.location}</p><h3>{selected.title}</h3><p><strong>Status:</strong> {label(selected.status)} · <strong>Admin finding:</strong> {label(selected.confirmed_category)}</p><p><strong>Action:</strong> {label(selected.action_taken)} · <strong>Outcome:</strong> {label(selected.outcome)}</p><p>{selected.admin_response || 'No admin response recorded.'}</p><ol>{selected.timeline.map((event, i) => <li key={i}><strong>{label(event.status)}</strong> · {new Date(event.at).toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' })}<p>{event.notes}</p></li>)}</ol></dialog>}
  </div>;
}
