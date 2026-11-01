import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

// Customer view of their own tanks. The badge follows the water level; whether a
// device is currently reporting is conveyed by the "Last update" line rather than
// replacing the reading with an OFFLINE label.
export default function CustomerHome({ onReport }) {
  const [tanks, setTanks] = useState(null), [error, setError] = useState('');
  const load = () => api.get('/my/tanks').then(r => { if (r.success) { setTanks(r.data); setError(''); } else setError(r.error); });
  useEffect(() => { load(); return api.subscribeRealtime((event) => { if (['TANK_UPDATED', 'DEVICE_STATUS_CHANGED', 'SYNC'].includes(event)) load(); }); }, []);

  const condition = (t) => {
    if (!t.last_reading_at) return 'No reading received yet';
    if (t.current_status === 'SENSOR_ERROR') return 'Sensor error';
    return t.current_condition || t.current_status;
  };

  return <div>
    <h1>Your water</h1>
    <button onClick={onReport}>View or submit a report</button> <button onClick={load}>Refresh</button>
    {error && <p role="alert">{error}</p>}
    {tanks === null ? <p>Loading…</p> : !tanks.length ? <p>No tank is assigned to your account. Contact your administrator.</p> : tanks.map(t => <section className="card" key={t.id} style={{ padding: 20, marginTop: 16 }}>
      <h2>{t.name}</h2>
      {t.last_reading_at ? <>
        <p>Last known level: {Number(t.current_water_percent).toFixed(1)}%</p>
        {t.current_volume_l != null && <p>Estimated volume: {Number(t.current_volume_l).toFixed(1)} L</p>}
      </> : <p>No reading received yet.</p>}
      <p>Condition: {condition(t)}</p>
      <p>Last update: {t.last_reading_at || 'Never'}{t.reading_fresh === false && t.last_reading_at ? ' (device not currently reporting)' : ''}</p>
    </section>)}
  </div>;
}
