import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import TelemetryIntelligence from '../components/TelemetryIntelligence';

const label = value => String(value || 'Unspecified').replaceAll('_', ' ');
const number = value => value == null ? '—' : Number(value).toFixed(1);

export default function ReportAnalytics({ stations }) {
  const [filters, setFilters] = useState({ from: '', to: '', category: '', status: '', station: '', location: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    api.get(`/analytics/reports?${query}`).then(res => {
      if (!active) return;
      setLoading(false);
      setError(res.success ? '' : res.error || 'Unable to load analytics');
      setResult(res.success ? res.data : null);
    });
    return () => { active = false; };
  }, [filters]);
  const set = e => setFilters({ ...filters, [e.target.name]: e.target.value });
  const table = (title, rows, percent = false) => <section className="card" style={{ padding: 20, marginTop: 16 }}><h3>{title}</h3>{rows.length === 0 ? <p>No reports in this selection.</p> : <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>Group</th><th>Reports</th>{percent && <th>Share</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{label(row.label)}</td><td>{row.count}</td>{percent && <td>{number(row.count * 100 / result.total)}%</td>}</tr>)}</tbody></table>}</section>;
  return <div>
    <h1>Report intelligence</h1><p>Descriptive analysis of submitted reports, not confirmed infrastructure failures.</p>
    <div className="card" style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label>From <input type="date" name="from" value={filters.from} onChange={set} /></label>
      <label>To <input type="date" name="to" value={filters.to} onChange={set} /></label>
      <label>Category <select name="category" value={filters.category} onChange={set}><option value="">All</option>{['WATER_SHORTAGE','PIPE_LEAKAGE','BURST_PIPE','TANK_MALFUNCTION','WATER_QUALITY','OTHER'].map(x => <option key={x} value={x}>{label(x)}</option>)}</select></label>
      <label>Status <select name="status" value={filters.status} onChange={set}><option value="">All</option>{['SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','REJECTED'].map(x => <option key={x} value={x}>{label(x)}</option>)}</select></label>
      <label>Station <select name="station" value={filters.station} onChange={set}><option value="">All</option>{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Exact location <input name="location" value={filters.location} onChange={set} /></label>
    </div>
    {loading ? <p>Loading report analytics…</p> : error ? <p role="alert">{error}</p> : result && <>
      <section className="card" style={{ padding: 20, marginTop: 16 }}><h3>Submission cohort · {result.total} reports</h3><p>Awaiting review: {result.statuses.SUBMITTED || 0} · Reviewed: {result.statuses.ACKNOWLEDGED || 0} · Investigating: {result.statuses.IN_PROGRESS || 0} · Resolved: {result.statuses.RESOLVED || 0} · Rejected: {result.statuses.REJECTED || 0}</p><p>Resolution rate: {number(result.resolution.rate_percent)}{result.resolution.rate_percent == null ? '' : '%'} ({result.resolution.eligible} eligible, excluding rejected). Mean / median resolution: {number(result.resolution.mean_hours)} / {number(result.resolution.median_hours)} hours ({result.resolution.observations} timed reports).</p></section>
      {table('Reported categories', result.categories, true)}
      {table('Recorded location names', result.locations)}
      {table('Submissions by day', result.days)}
      <TelemetryIntelligence from={filters.from} to={filters.to} />
      <p>Location names are grouped as recorded; they are not verified boundaries. Resolution duration uses the latest recorded resolution event for currently resolved reports. Filters apply to submission dates and current report fields. The three known baseline reports are excluded; other test records cannot currently be identified automatically. Report analytics is not certified as operational-only.</p>
    </>}
  </div>;
}
