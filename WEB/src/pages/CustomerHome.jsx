import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
export default function CustomerHome({ onReport }) {
  const [tanks,setTanks] = useState(null), [error,setError] = useState('');
  const load=()=>api.get('/my/tanks').then(r=>{if(r.success){setTanks(r.data);setError('');} else setError(r.error);});
  useEffect(()=>{load();return api.subscribeRealtime((event)=>{if(['TANK_UPDATED','DEVICE_STATUS_CHANGED','SYNC'].includes(event))load();});},[]);
  return <div><h1>Your water</h1><p>Last-known levels may be stale if a device is offline.</p><button onClick={onReport}>View or submit a report</button> <button onClick={load}>Refresh</button>{error && <p role="alert">{error}</p>}{tanks === null ? <p>Loading…</p> : !tanks.length ? <p>No tank is assigned to your account. Contact your administrator.</p> : tanks.map(t=><section className="card" key={t.id} style={{padding:20,marginTop:16}}><h2>{t.name}</h2>{t.last_reading_at ? <><p>Last known level: {Number(t.current_water_percent).toFixed(1)}%</p>{t.current_volume_l != null && <p>Estimated volume: {Number(t.current_volume_l).toFixed(1)} L</p>}</> : <p>No reading received yet.</p>}<p>Condition: {t.device_status === 'OFFLINE' ? 'DEVICE OFFLINE' : t.current_condition || t.current_status}</p><p>Device: {t.device_status || 'UNKNOWN'} · Last update: {t.last_reading_at || 'Never'}</p>{t.installation_status !== 'CALIBRATED' && <p>Calibration not verified; estimates may be inaccurate.</p>}</section>)}</div>;
}
