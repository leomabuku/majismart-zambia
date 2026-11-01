import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOctoberDemo,OCTOBER_DEMO,ensureOctoberDemo} from '../src/services/octoberDemo.js';
import {analyzeReports} from '../src/services/reportIntelligence.js';

const batch=buildOctoberDemo();
const details=new Map(batch.details.map(d=>[d.report_id,d]));
const rows=batch.reports.map(r=>({...r,...details.get(r.id),id:r.id}));

test('existing dataset markers work with PostgreSQL JSONB and SQLite text without reinserting reports',async()=>{
  const metadata={...OCTOBER_DEMO,reports:334,provenance:'SIMULATED'};
  for(const value of [metadata,JSON.stringify(metadata)]){
    const restored=await ensureOctoberDemo({get:async()=>({value}),transaction:()=>assert.fail('must not reinsert an existing dataset')});
    assert.deepEqual(restored,metadata);
  }
});

test('October scenario is deterministic, labelled synthetic and has valid chronological response histories',()=>{
  assert.deepEqual(buildOctoberDemo(),batch);
  assert.equal(batch.reports.length,334);
  assert.equal(new Set(batch.reports.map(r=>r.reporter_name)).size,80);
  assert.ok(batch.reports.every(r=>r.title.startsWith('[DEMO]')&&r.reporter_id===null&&r.reporter_phone===null));
  assert.ok(batch.details.every(d=>d.provenance==='SIMULATED'));
  assert.equal(new Set(batch.details.map(d=>d.reported_category)).size,10);
  for(const r of batch.reports){
    const events=batch.history.filter(h=>h.report_id===r.id);
    assert.equal(events[0].new_status,'SUBMITTED');
    assert.equal(events.at(-1).new_status,r.status);
    assert.ok(events.every((h,i)=>Date.parse(h.created_at)<=Date.parse(OCTOBER_DEMO.asOf)&&(!i||h.created_at>=events[i-1].created_at)));
    assert.ok(Date.parse(r.updated_at)>=Date.parse(events.at(-1).created_at));
  }
});

test('scenario totals reconcile across records, charts, statuses, durations and daily workloads',()=>{
  const result=analyzeReports(rows,batch.history,batch.cases,{dataset:'october-demo',from:'2026-10-01',to:'2026-10-31',asOf:OCTOBER_DEMO.asOf});
  assert.equal(result.total,334);assert.equal(result.unique_demo_residents,80);
  assert.equal(result.statuses.RESOLVED,211);assert.equal(result.statuses.REJECTED,20);assert.equal(result.open,103);
  assert.equal(result.resolution.eligible,314);assert.equal(result.resolution.rate_percent,67.2);
  assert.equal(result.response.unanswered,35);assert.equal(result.resolution.observations,211);
  for(const key of ['categories','locations','days','months','classifications','severities','actions','outcomes']) assert.equal(result[key].reduce((n,r)=>n+r.count,0),334,key);
  assert.equal(result.daily_workload.length,31);
  assert.equal(result.daily_workload.reduce((n,r)=>n+r.resolved,0),211);
  assert.equal(result.duration_bands.first_response.reduce((n,r)=>n+r.count,0),result.response.observations);
  assert.equal(Object.values(result.open_age).reduce((a,b)=>a+b,0),103);
  assert.ok(result.recommendations.some(r=>r.title.includes('water-quality')));
  assert.ok(result.recommendations.every(r=>r.evidence&&r.action));
});

test('latest case classification counts once; re-saving resolved does not reset the clock',()=>{
  const result=analyzeReports([{id:'r',title:'Test',category:'PIPE_LEAKAGE',created_at:'2026-10-01T08:00:00Z',status:'RESOLVED',location_name:'Zone A'}],[
    {id:'h1',report_id:'r',new_status:'ACKNOWLEDGED',previous_status:'SUBMITTED',created_at:'2026-10-01T09:00:00Z'},
    {id:'h2',report_id:'r',new_status:'RESOLVED',previous_status:'IN_PROGRESS',created_at:'2026-10-01T10:00:00Z'},
    {id:'h3',report_id:'r',new_status:'RESOLVED',previous_status:'RESOLVED',created_at:'2026-10-01T13:00:00Z'}
  ],[
    {id:'e1',report_id:'r',confirmed_category:'MAJOR_LEAK',severity:'HIGH',created_at:'2026-10-01T09:00:00Z'},
    {id:'e2',report_id:'r',confirmed_category:'DAMAGED_VALVE',severity:'LOW',created_at:'2026-10-01T10:00:00Z'}
  ],{asOf:OCTOBER_DEMO.asOf});
  assert.equal(result.response.median_hours,1);assert.equal(result.resolution.mean_hours,2);
  assert.deepEqual(result.classifications,[{label:'DAMAGED_VALVE',count:1}]);
  assert.equal(result.records[0].reporter,'Private reporter');
});

test('empty selections do not invent rates, causes or recommendations',()=>{
  const result=analyzeReports([],[],[],{asOf:OCTOBER_DEMO.asOf,from:'2026-10-01',to:'2026-10-31'});
  assert.equal(result.total,0);assert.equal(result.resolution.rate_percent,null);
  assert.equal(result.response.mean_hours,null);assert.equal(result.resolution.mean_hours,null);
  assert.equal(result.days.length,31);assert.ok(result.days.every(d=>d.count===0));
  assert.deepEqual(result.recommendations,[]);
});

test('a case investigation counts as an admin response even before a status transition',()=>{
  const result=analyzeReports([{id:'r',title:'Test',category:'WATER_SHORTAGE',created_at:'2026-10-01T08:00:00Z',status:'SUBMITTED',location_name:'Zone A'}],[],[
    {id:'e',report_id:'r',notes:'Team investigating',created_at:'2026-10-01T09:30:00Z'}
  ],{asOf:OCTOBER_DEMO.asOf});
  assert.equal(result.response.median_hours,1.5);assert.equal(result.response.unanswered,0);
  assert.equal(result.records[0].admin_response,'Team investigating');
  assert.equal(result.open,1);assert.equal(result.resolution.observations,0);
});
