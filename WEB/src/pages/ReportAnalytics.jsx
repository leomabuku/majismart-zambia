import React, { useEffect, useState } from 'react';
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
  const data={labels:source.map(row=>label(row.label)),datasets:[{label:'Reports',data:source.map(row=>row.count),backgroundColor:type==='doughnut'?colors:'#0077B6',borderRadius:4}]};
  return <section className="insight-panel"><h3>{title}</h3>{note&&<p className="insight-note">{note}</p>}
    <div className="insight-chart">{source.some(r=>r.count>0)?type==='doughnut'?<Doughnut data={data} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}} aria-label={title} role="img"/>:<Bar data={data} options={{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}} aria-label={title} role="img"/>:<p>No observations for this selection.</p>}</div>
    <details><summary>View exact counts</summary><div className="insight-scroll"><table><thead><tr><th scope="col">Group</th><th scope="col">Reports</th></tr></thead><tbody>{rows.map(row=><tr key={row.label||'unspecified'}><th scope="row">{label(row.label)}</th><td>{row.count}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export default function ReportAnalytics({stations=[]}) {
  const [filters,setFilters]=useState({dataset:'october-demo',from:'2026-10-01',to:'2026-10-31',category:'',status:'',station:'',location:''});
  const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [page,setPage]=useState(0),[selected,setSelected]=useState(null);
  useEffect(()=>{
    let active=true;setLoading(true);setResult(null);setSelected(null);setPage(0);
    const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
    api.get(`/analytics/reports?${query}`).then(res=>{if(active){const compatible=res.success&&Array.isArray(res.data?.records)&&res.data.dataset===filters.dataset;setLoading(false);setError(compatible?'':res.success?'The updated analysis service is deploying. Refresh shortly.':res.error||'Unable to load analysis');setResult(compatible?res.data:null);}});
    return ()=>{active=false;};
  },[filters,revision]);
  useEffect(()=>{
    let timer;
    const stop=api.subscribeRealtime(event=>{if(['REPORT_CREATED','REPORT_STATUS_CHANGED'].includes(event)){clearTimeout(timer);timer=setTimeout(()=>setRevision(v=>v+1),500);}});
    return ()=>{clearTimeout(timer);stop();};
  },[]);
  const set=e=>setFilters(f=>({...f,[e.target.name]:e.target.value}));
  const changeDataset=e=>setFilters({dataset:e.target.value,from:e.target.value==='october-demo'?'2026-10-01':'',to:e.target.value==='october-demo'?'2026-10-31':'',category:'',status:'',station:'',location:''});
  const download=()=>{
    const url=URL.createObjectURL(new Blob([reportCsv(result)],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download=`MajiSmart-${filters.dataset}-${filters.from||'all'}-${filters.to||'current'}.csv`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const rows=result?.records||[], pages=Math.ceil(rows.length/25);
  const locationNames=result?.hotspots.map(r=>r.label)||[];
  const matrix=result?.categories.map(c=>({category:c.label,counts:locationNames.map(place=>rows.filter(r=>r.location===place&&r.category===c.label).length)}))||[];
  const matrixMax=Math.max(1,...matrix.flatMap(row=>row.counts));
  const daily=result?.daily_workload||[];
  return <div className="insights">
    <div className="insight-heading"><div><p className="insight-eyebrow">Community service intelligence</p><h1><BarChart3 size={25} aria-hidden="true"/> Reports, response & recovery</h1><p>Explore complaints, administrative findings and the work still needing attention.</p></div><div className="insight-actions"><button className="btn-secondary" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/> Refresh</button><button className="btn-primary" disabled={!result||loading} onClick={download}><Download size={15}/> Export report-level CSV</button></div></div>
    <section className="insight-filters insight-panel">
      <label>Dataset<select name="dataset" value={filters.dataset} onChange={changeDataset}><option value="october-demo">October 2026 — synthetic scenario</option><option value="operational">Operational / unverified submissions</option></select></label>
      <label>Submitted from<input type="date" name="from" value={filters.from} onChange={set}/></label><label>Through<input type="date" name="to" value={filters.to} onChange={set}/></label>
      <label>Reported issue<select name="category" value={filters.category} onChange={set}><option value="">All issues</option>{categories.map(c=><option key={c} value={c}>{label(c)}</option>)}</select></label>
      <label>Current status<select name="status" value={filters.status} onChange={set}><option value="">All statuses</option>{['SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','REJECTED'].map(c=><option key={c} value={c}>{label(c)}</option>)}</select></label>
      <label>Station<select name="station" value={filters.station} onChange={set}><option value="">All / unassigned</option>{stations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Exact location<input name="location" value={filters.location} onChange={set} placeholder="e.g. Mtendere"/></label>
    </section>
    {filters.dataset==='october-demo'?<div className="insight-demo"><strong>SYNTHETIC OCTOBER DATASET</strong><p>Fictional residents, reports and admin responses for analysis and training. These records are not evidence of incidents in the named communities. Snapshot: 31 October 2026, 23:59 Zambia time. Excluded from operational report lists and totals.</p></div>:<div className="insight-caution">Simulated and test records are excluded. Submissions labelled UNKNOWN remain unverified; complaint counts are not confirmed infrastructure failures.</div>}
    {loading?<p role="status">Computing report analysis…</p>:error?<p role="alert" className="insight-caution">{error}</p>:result&&<>
      <div className="insight-kpis">{[
        ['Reports submitted',result.total],['Resolved',result.statuses.RESOLVED||0],['Still open',result.open],['High / critical open',result.urgent_open],
        ['Resolution rate',result.resolution.rate_percent==null?'—':number(result.resolution.rate_percent)+'%'],['Median response',result.response.median_hours==null?'—':number(result.response.median_hours)+' h']
      ].map(([title,value])=><section className="insight-panel" key={title}><span>{title}</span><strong>{value}</strong></section>)}</div>
      <p className="insight-note">{result.unique_demo_residents!=null?`${result.unique_demo_residents} distinct fictional residents in this selection. `:''}Resolution rate excludes rejected reports ({result.resolution.eligible} eligible). Dates use Zambia time; filters select report submission cohorts.</p>
      <section className="insight-panel insight-summary"><p className="insight-eyebrow">Evidence-led narrative</p><h2>What the data shows</h2>{result.summaries.map((text,i)=><p key={i}>{text}</p>)}</section>
      <div className="insight-grid">
        <section className="insight-panel"><h3>Daily workload and recorded closures</h3><p className="insight-note">Closures are the latest resolution of selected reports on the date shown, not all work done by the utility.</p><div className="insight-chart"><Line data={{labels:daily.map(d=>d.date.slice(5)),datasets:[{label:'Submitted',data:daily.map(d=>d.submitted),borderColor:'#0077B6',tension:.2,pointRadius:2},{label:'Resolved',data:daily.map(d=>d.resolved),borderColor:'#14B8A6',tension:.2,pointRadius:2}]}} options={{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,ticks:{precision:0}},x:{ticks:{maxTicksLimit:10}}}}} role="img" aria-label="Daily submissions and latest report resolutions"/></div><details><summary>View daily values</summary><div className="insight-scroll"><table><thead><tr><th>Date</th><th>Submitted</th><th>Resolved</th></tr></thead><tbody>{daily.map(d=><tr key={d.date}><th>{d.date}</th><td>{d.submitted}</td><td>{d.resolved}</td></tr>)}</tbody></table></div></details></section>
        <Graph title="Current workflow status" type="doughnut" rows={Object.entries(result.statuses).map(([label,count])=>({label,count}))}/>
        <Graph title="Resident-reported issues" rows={result.categories}/>
        <Graph title="Latest administrative severity" rows={result.severities} note="Severity is a recorded admin assessment; unreviewed reports remain unspecified."/>
        <Graph title="First admin response time" rows={result.duration_bands.first_response} note={`${result.response.observations} timed reports; ${result.response.unanswered} without a recorded response. ${number(result.response.within_24h_percent)}% of timed responses were within 24 hours.`}/>
        <Graph title="Time to resolution" rows={result.duration_bands.resolution} note={`${result.resolution.observations} timed, currently resolved reports. Median ${number(result.resolution.median_hours)} h; mean ${number(result.resolution.mean_hours)} h; 90th percentile ${number(result.resolution.p90_hours)} h.`}/>
        <Graph title="Latest action taken per report" rows={result.actions}/>
        <Graph title="Admin-recorded confirmed causes" rows={result.causes} note="Unspecified means no confirmed cause is recorded. Association is not proof of a system-wide cause."/>
        <Graph title="Age of unresolved reports" rows={Object.entries(result.open_age).map(([key,count])=>({label:({under_24h:'Under 24 hours',from_24_to_48h:'24–48 hours',from_48h_to_7d:'2–7 days',over_7d:'Over 7 days'})[key],count}))} note={`Ages measured at ${new Date(result.as_of).toLocaleString('en-GB',{timeZone:'Africa/Lusaka'})} Zambia time. These are review bands, not contractual SLAs.`}/>
        <Graph title="Latest case outcomes" rows={result.outcomes}/>
      </div>
      <section className="insight-panel"><h2>Location × reported fault</h2><p className="insight-note">Exact counts, grouped by location text. No population denominator, verified geographic boundaries or unique-incident deduplication is available.</p><div className="insight-scroll"><table className="insight-matrix"><thead><tr><th scope="col">Reported issue</th>{locationNames.map(place=><th scope="col" key={place}>{place}</th>)}</tr></thead><tbody>{matrix.map(row=><tr key={row.category}><th scope="row">{label(row.category)}</th>{row.counts.map((count,i)=><td key={i} style={{background:count?`rgba(0,119,182,${.08+.6*count/matrixMax})`:'transparent',color:count>matrixMax*.6?'white':'#0F172A'}}>{count}</td>)}</tr>)}</tbody></table></div></section>
      <section className="insight-panel"><h2>Category performance</h2><div className="insight-scroll"><table><thead><tr><th>Issue</th><th>Reports</th><th>Open</th><th>Resolved</th><th>Resolved / eligible</th><th>Mean resolution</th></tr></thead><tbody>{result.category_performance.map(c=><tr key={c.label}><th>{label(c.label)}</th><td>{c.count}</td><td>{c.open}</td><td>{c.resolved}</td><td>{number(c.resolution_rate_percent)}%</td><td>{number(c.mean_resolution_hours)} h</td></tr>)}</tbody></table></div></section>
      <section className="insight-panel"><p className="insight-eyebrow">From evidence to action</p><h2>Recommended next actions</h2><p className="insight-note">Transparent rule-based suggestions using the selected data. A responsible operator must validate each action; these are not automated dispatch or spending decisions.</p><div className="insight-recommendations">{result.recommendations.map((r,i)=><article key={r.title}><span>{r.priority}</span><h3>{i+1}. {r.title}</h3><p><strong>Evidence:</strong> {r.evidence}</p><p>{r.action}</p></article>)}</div></section>
      <section className="insight-panel"><h2>Explore the report-level dataset</h2><p className="insight-note">Original reported category is separate from the administrative classification. Real reporter identities are not included in this export.</p><div className="insight-scroll"><table><thead><tr><th>Report / date</th><th>Resident</th><th>Location</th><th>Reported issue</th><th>Admin finding</th><th>Status</th><th>Response</th><th>Resolved in</th><th>Admin response</th></tr></thead><tbody>{rows.slice(page*25,page*25+25).map(r=><tr key={r.id}><th>{r.id}<small>{new Date(r.created_at).toLocaleString('en-GB',{timeZone:'Africa/Lusaka'})}</small></th><td>{r.reporter}</td><td>{r.location}</td><td>{label(r.category)}</td><td>{label(r.confirmed_category)}</td><td>{label(r.status)}</td><td>{number(r.first_response_hours)} h</td><td>{number(r.resolution_hours)} h</td><td><button className="insight-link" onClick={()=>setSelected(r)}>View response</button></td></tr>)}</tbody></table></div><div className="insight-pagination"><button className="btn-secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{rows.length?`${page*25+1}–${Math.min((page+1)*25,rows.length)} of ${rows.length}`:'No matching reports'}</span><button className="btn-secondary" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>
      {selected&&<section className="insight-panel insight-case" aria-label="Selected report response"><button className="btn-secondary" onClick={()=>setSelected(null)}>Close response</button><h2>{selected.id} · {selected.location}</h2><p>{selected.title}</p><p><strong>Admin action:</strong> {label(selected.action_taken)} · <strong>Outcome:</strong> {label(selected.outcome)} · <strong>Assigned:</strong> {selected.assigned_to||'Unassigned'}</p><p>{selected.admin_response||'No recorded response.'}</p><ol>{selected.timeline.map((event,i)=><li key={i}><strong>{label(event.status)}</strong> · {new Date(event.at).toLocaleString('en-GB',{timeZone:'Africa/Lusaka'})}<p>{event.notes}</p></li>)}</ol></section>}
      {filters.dataset==='operational'&&<TelemetryIntelligence from={filters.from} to={filters.to}/>}
      <p className="insight-note">{result.definitions.causality} Resolution durations exclude currently open cases and missing histories. A report can represent a duplicate complaint; rejected reports are counted separately. Exported CSV contains the full filtered cohort, up to 5,000 reports.</p>
    </>}
  </div>;
}
