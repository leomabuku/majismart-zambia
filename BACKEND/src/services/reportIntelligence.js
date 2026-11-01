import { parseStoredTimestamp } from '../lib/timestamps.js';
const HOUR = 3600000;
const day = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lusaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const round = n => Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
const label = value => String(value || 'Unspecified').toLowerCase().replaceAll('_',' ');
const openStatuses = new Set(['SUBMITTED','ACKNOWLEDGED','IN_PROGRESS']);
const caseFields = ['confirmed_category','severity','suspected_cause','confirmed_cause','action_taken','outcome','assigned_to','notes'];
const stats = values => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b), n = sorted.length;
  return { observations:n, mean_hours:n ? round(sorted.reduce((a,b)=>a+b,0)/n) : null,
    median_hours:n ? round((sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)])/2) : null,
    p90_hours:n ? round(sorted[Math.ceil(n*.9)-1]) : null };
};
const grouped = (rows, getter) => {
  const counts = new Map();
  for(const row of rows) { const key = getter(row) || null; counts.set(key,(counts.get(key)||0)+1); }
  return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count || String(a.label).localeCompare(String(b.label)));
};

export function analyzeReports(rows, histories, caseEvents, {dataset='operational',from,to,asOf=new Date().toISOString()} = {}) {
  const now = parseStoredTimestamp(asOf);
  const events = new Map(), history = new Map(), casesByReport = new Map();
  const chronological = list => [...list].sort((a,b)=>parseStoredTimestamp(a.created_at)-parseStoredTimestamp(b.created_at) || a.id.localeCompare(b.id));
  for(const event of chronological(caseEvents)) {
    if(parseStoredTimestamp(event.created_at)>now) continue;
    if(!casesByReport.has(event.report_id)) casesByReport.set(event.report_id,[]);
    casesByReport.get(event.report_id).push(event);
    const latest = events.get(event.report_id) || {};
    for(const field of caseFields) if(event[field]!=null) latest[field]=event[field];
    events.set(event.report_id,latest);
  }
  for(const event of chronological(histories)) {
    if(parseStoredTimestamp(event.created_at)>now) continue;
    if(!history.has(event.report_id)) history.set(event.report_id,[]);
    history.get(event.report_id).push(event);
  }
  const records = rows.map(row=> {
    const created = parseStoredTimestamp(row.created_at), latest=events.get(row.id)||{};
    const changes=(history.get(row.id)||[]).filter(h=>parseStoredTimestamp(h.created_at)>=created);
    const caseChanges=(casesByReport.get(row.id)||[]).filter(e=>parseStoredTimestamp(e.created_at)>=created);
    const administrativeChanges=chronological([...changes.filter(h=>h.new_status!=='SUBMITTED' && h.new_status!==h.previous_status),...caseChanges]);
    const responded=administrativeChanges[0];
    const resolved=[...changes].reverse().find(h=>h.new_status==='RESOLVED' && h.previous_status!=='RESOLVED');
    const responseHours=responded ? (parseStoredTimestamp(responded.created_at)-created)/HOUR : null;
    const resolutionHours=row.status==='RESOLVED' && resolved ? (parseStoredTimestamp(resolved.created_at)-created)/HOUR : null;
    return {
      id:row.id, title:row.title, reporter:dataset==='october-demo' ? row.reporter_name : 'Private reporter',
      location:row.location_name,station_id:row.station_id,category:row.reported_category||row.category,
      provenance:row.provenance||'UNKNOWN', status:row.status,created_at:row.created_at,
      ...latest, severity:latest.severity||'UNKNOWN',
      first_response_at:responded?.created_at||null,first_response_hours:round(responseHours),
      resolved_at:row.status==='RESOLVED' ? resolved?.created_at||null : null,resolution_hours:round(resolutionHours),
      open_age_hours:openStatuses.has(row.status) ? round(Math.max(0,(now-created)/HOUR)) : null,
      reopened:changes.some(h=>h.previous_status==='RESOLVED' && openStatuses.has(h.new_status))
      ,admin_response:[...administrativeChanges].reverse().find(e=>e.notes)?.notes || null,
      timeline:dataset==='october-demo'?changes.map(h=>({status:h.new_status,at:h.created_at,notes:h.notes})):[]
    };
  });
  const statuses=Object.fromEntries(grouped(records,r=>r.status).map(r=>[r.label,r.count]));
  const total=records.length, eligible=total-(statuses.REJECTED||0), open=records.filter(r=>openStatuses.has(r.status));
  const responseValues=records.filter(r=>r.first_response_hours!=null).map(r=>r.first_response_hours);
  const resolutionValues=records.filter(r=>r.resolution_hours!=null && r.resolution_hours>=0).map(r=>r.resolution_hours);
  const categories=grouped(records,r=>r.category), locations=grouped(records,r=>r.location);
  const days=grouped(records,r=>day(r.created_at));
  const start=from || (days.length ? days.map(d=>d.label).sort()[0] : null), end=to||day(now);
  const daily=new Map(days.map(d=>[d.label,d.count]));
  if(start && Date.parse(end)-Date.parse(start)<=366*86400000) {
    for(let date=Date.parse(start);date<=Date.parse(end);date+=86400000) {
      const key=new Date(date).toISOString().slice(0,10);if(!daily.has(key))daily.set(key,0);
    }
  }
  const aged={under_24h:0,from_24_to_48h:0,from_48h_to_7d:0,over_7d:0};
  for(const report of open) aged[report.open_age_hours<24?'under_24h':report.open_age_hours<=48?'from_24_to_48h':report.open_age_hours<=168?'from_48h_to_7d':'over_7d']++;
  const categoryPerformance=categories.map(group=>{
    const cohort=records.filter(r=>r.category===group.label), accepted=cohort.filter(r=>r.status!=='REJECTED'), closed=accepted.filter(r=>r.status==='RESOLVED');
    return {...group,open:cohort.filter(r=>openStatuses.has(r.status)).length,resolved:closed.length,
      resolution_rate_percent:accepted.length?round(closed.length/accepted.length*100):null,
      mean_resolution_hours:stats(closed.filter(r=>r.resolution_hours!=null).map(r=>r.resolution_hours)).mean_hours};
  });
  const durations=values=>[0,4,24,72,168].map((minimum,index)=>({label:['Under 4 h','4–24 h','1–3 days','3–7 days','7 days or more'][index],count:values.filter(v=>v>=minimum && (index===4||v<[4,24,72,168][index])).length}));
  const closedByDay=new Map(grouped(records.filter(r=>r.resolved_at),r=>day(r.resolved_at)).map(r=>[r.label,r.count]));
  const hotspots=locations.map(group=>{
    const cohort=records.filter(r=>r.location===group.label);
    return {...group,open:cohort.filter(r=>openStatuses.has(r.status)).length,
      urgent_open:cohort.filter(r=>openStatuses.has(r.status)&&['HIGH','CRITICAL'].includes(r.severity)).length,
      dominant_category:grouped(cohort,r=>r.category)[0]?.label};
  }).sort((a,b)=>b.urgent_open-a.urgent_open||b.open-a.open||b.count-a.count);
  const urgent=open.filter(r=>['HIGH','CRITICAL'].includes(r.severity));
  const response=stats(responseValues), resolution=stats(resolutionValues);
  response.unanswered=total-response.observations;
  response.within_24h_percent=responseValues.length?round(responseValues.filter(h=>h<=24).length/responseValues.length*100):null;
  const summaries=[],recommendations=[];
  summaries.push(`${total} reports were submitted in the selected cohort: ${statuses.RESOLVED||0} resolved, ${open.length} still open and ${statuses.REJECTED||0} rejected. Reports may include multiple complaints about the same incident.`);
  if(categories[0]) summaries.push(`${label(categories[0].label)} was the most frequently reported issue (${categories[0].count} reports; ${round(categories[0].count/total*100)}% of submissions).`);
  const peak=[...days].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))[0];
  if(peak) summaries.push(`The busiest submission day was ${peak.label}, with ${peak.count} reports. Check duplicate reporting and shared service-zone events before interpreting this as a spike in distinct failures.`);
  if(hotspots[0]) summaries.push(`${hotspots[0].label} has ${hotspots[0].open} open reports, including ${hotspots[0].urgent_open} with high or critical administrative severity. Location counts reflect reporting activity, not population-adjusted failure rates.`);
  if(response.observations) summaries.push(`Median first admin response was ${response.median_hours} hours; 90% of recorded responses occurred within ${response.p90_hours} hours. ${response.unanswered} reports have no recorded admin response.`);
  if(resolution.observations) summaries.push(`Median resolution was ${resolution.median_hours} hours across ${resolution.observations} timed, currently resolved reports. Open reports are excluded, so this is not the expected wait for the current backlog.`);
  const quality=open.filter(r=>r.category==='WATER_QUALITY');
  if(quality.length) recommendations.push({priority:'Immediate review',title:'Investigate open water-quality complaints',evidence:`${quality.length} open water-quality reports.`,action:'Escalate to the responsible water-quality team for sampling and investigation. Do not infer confirmed contamination or safety from complaint text or case closure alone.'});
  if(urgent.length) recommendations.push({priority:'High',title:'Triage unresolved high-severity cases',evidence:`${urgent.length} open reports have HIGH or CRITICAL admin severity.`,action:'Review the queue, confirm field risk, assign an accountable response team and record the next update time.'});
  if(hotspots[0]?.open) recommendations.push({priority:'High',title:`Review recurring reports in ${hotspots[0].label}`,evidence:`${hotspots[0].count} submissions, ${hotspots[0].open} still open; leading reported issue: ${label(hotspots[0].dominant_category)}.`,action:'Check for duplicate complaints and shared service-zone causes before scheduling targeted inspections. Validate against maintenance and telemetry evidence.'});
  const leaks=records.filter(r=>['PIPE_LEAKAGE','BURST_PIPE'].includes(r.category));
  if(leaks.length) recommendations.push({priority:'Planned maintenance',title:'Target leak and burst-pipe investigations',evidence:`${leaks.length} leak or burst reports in this cohort.`,action:'Review repeat repair locations and recorded causes, then plan condition surveys. Use measured flow and verified repair records before estimating water savings or repair budgets.'});
  if(response.unanswered||aged.over_7d) recommendations.push({priority:'Service management',title:'Reduce unacknowledged and ageing work',evidence:`${response.unanswered} reports without a recorded response; ${aged.over_7d} open for more than seven days.`,action:'Review dispatch capacity and record missing actions. Set local response targets; the 24-hour comparison and ageing bands shown here are review thresholds, not contractual SLAs.'});
  const monitoring=records.filter(r=>r.category==='MONITORING_FAULT');
  if(monitoring.length) recommendations.push({priority:'Monitoring reliability',title:'Verify monitoring faults against field observations',evidence:`${monitoring.length} monitoring-fault reports.`,action:'Check device power, communications, mounting and calibration. Compare against a manual observation before classifying a supply failure or planning a physical repair.'});
  const unclassified=records.filter(r=>r.status!=='REJECTED'&&(!r.confirmed_category||r.confirmed_category==='UNCLASSIFIED')).length;
  if(unclassified) recommendations.push({priority:'Data quality',title:'Complete case classification and follow-up',evidence:`${unclassified} reports lack a specific administrative classification.`,action:'Record findings, cause confidence, action, outcome and response timestamps. Preserve the resident’s original description separately.'});
  if(!total) summaries.push('No evidence is available for this selection. Broaden the filters before drawing operational conclusions.');
  return {total,statuses,categories,locations,days:[...daily].map(([label,count])=>({label,count})).sort((a,b)=>a.label.localeCompare(b.label)),
    months:grouped(records,r=>day(r.created_at).slice(0,7)),stations:grouped(records,r=>r.station_id),
    classifications:grouped(records,r=>r.confirmed_category),severities:grouped(records,r=>r.severity),outcomes:grouped(records,r=>r.outcome),
    actions:grouped(records,r=>r.action_taken),causes:grouped(records,r=>r.confirmed_cause),provenance:grouped(records,r=>r.provenance),
    resolution:{...resolution,eligible,rate_percent:eligible?round((statuses.RESOLVED||0)/eligible*100):null},response,
    open:open.length,urgent_open:urgent.length,open_age:aged,hotspots,category_performance:categoryPerformance,
    duration_bands:{first_response:durations(responseValues),resolution:durations(resolutionValues)},
    daily_workload:[...daily].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,submitted])=>({date,submitted,resolved:closedByDay.get(date)||0})),
    summaries,recommendations,records,as_of:asOf,dataset,
    unique_demo_residents:dataset==='october-demo'?new Set(records.map(r=>r.reporter)).size:null,
    definitions:{cohort:'Submission dates in Africa/Lusaka; current status at the stated snapshot.',resolution:'Currently resolved reports with recorded resolution transitions; rejected reports excluded from the resolution-rate denominator.',causality:'Descriptive counts cannot establish causes, water volumes saved, water safety or population-adjusted incidence.'}};
}
