import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
const categories = ['UNCLASSIFIED','COMPLETE_INTERRUPTION','REDUCED_SUPPLY','LOW_PRESSURE','MINOR_LEAK','MAJOR_LEAK','BURST_PIPE','DAMAGED_CONNECTION','UNDERGROUND_LEAK','TANK_LEAK','STRUCTURAL_DAMAGE','OVERFLOW','FAULTY_INLET','FAULTY_OUTLET','DAMAGED_VALVE','DISCOLORATION','UNUSUAL_SMELL','CONTAMINATION','SENSOR_MALFUNCTION','DEVICE_OFFLINE','INACCURATE_READING','POWER_FAILURE','COMMUNICATION_FAILURE','OTHER'];
const label = s => s.replaceAll('_',' ');
export default function CaseManagement({ reportId }) {
  const [events,setEvents]=useState([]), [msg,setMsg]=useState(''), [form,setForm]=useState({confirmed_category:'',severity:'',suspected_cause:'',confirmed_cause:'',findings:'',action_taken:'',outcome:'',assigned_to:'',notes:''});
  const load=()=>api.get(`/reports/${reportId}/case`).then(r=>r.success ? setEvents(r.data) : setMsg(r.error));
  useEffect(()=>{load();},[reportId]);
  const change=e=>setForm({...form,[e.target.name]:e.target.value});
  const select=(name,title,values)=><label style={{display:'grid',gap:4}}>{title}<select name={name} value={form[name]} onChange={change}><option value="">Not recorded</option>{values.map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>;
  const input=(name,title)=><label style={{display:'grid',gap:4}}>{title}<input name={name} value={form[name]} onChange={change} maxLength={2000}/></label>;
  return <section style={{borderTop:'1px solid #ddd',paddingTop:16}}><h3>Internal case record</h3><p>Customer report is preserved above. Record confirmed findings only when established. Events are append-only.</p>
    {events.map(e=><div key={e.id} style={{padding:8,borderBottom:'1px solid #eee'}}><strong>{e.created_at} · {e.actor_name || 'Unknown administrator'}</strong><p>{[e.confirmed_category,e.severity,e.findings,e.suspected_cause && `Suspected: ${e.suspected_cause}`,e.confirmed_cause && `Confirmed cause: ${e.confirmed_cause}`,e.action_taken,e.outcome,e.assigned_to && `Assigned: ${e.assigned_to}`,e.notes].filter(Boolean).map(label).join(' · ')}</p></div>)}
    <form onSubmit={async e=>{e.preventDefault();const r=await api.post(`/reports/${reportId}/case`,form);setMsg(r.success?'Case event recorded':r.error);if(r.success) load();}} style={{display:'grid',gap:10,marginTop:12}}>
      {select('confirmed_category','Administrator classification',categories)}{select('severity','Operational severity',['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL'])}{input('findings','Investigation findings')}{input('suspected_cause','Suspected cause')}{input('confirmed_cause','Confirmed cause, if established')}{input('assigned_to','Assigned team or person')}{select('action_taken','Action taken',['NONE','INSPECTION','REPAIR','REPLACEMENT','FLUSHING','RESTORE_SUPPLY','ESCALATED','OTHER'])}{select('outcome','Outcome',['PENDING','RESOLVED','PARTIALLY_RESOLVED','INVALID','OTHER'])}{input('notes','Internal notes')}<button type="submit">Record case event</button><span role="status">{msg}</span>
    </form></section>;
}
