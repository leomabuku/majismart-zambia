import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';

// Menu-driven tank provisioning.
//
// Admins add tanks in bulk far more often than they measure one tank precisely,
// so the page leads with menus and derived values: pick a station, an owner, how
// many tanks and a size, and the API assigns tank codes, device identifiers and
// device credentials itself. Manual dimensions, custom identifiers and the
// calibration workflow stay available underneath.

const CAPACITY_OPTIONS = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 100000];
const HEIGHT_OPTIONS = [100, 150, 200, 250, 300];
const SHAPES = [
  { value: 'vertical_cylinder', label: 'Vertical cylinder (standard tank)' },
  { value: 'rectangular', label: 'Rectangular (concrete / masonry)' },
  { value: 'horizontal_cylinder', label: 'Horizontal cylinder (height = diameter)' }
];
const SENSORS = ['JSN-SR04T', 'HC-SR04', 'AJ-SR04M', 'DEMO-TELEMETRY', 'Other / unknown'];
const PROVENANCE = [
  { value: 'UNKNOWN', label: 'Real sensor, not yet classified' },
  { value: 'OPERATIONAL', label: 'Operational (real field data)' },
  { value: 'SIMULATED', label: 'Simulated (demo telemetry)' },
  { value: 'TEST', label: 'Test bench' }
];
const THRESHOLD_PRESETS = [
  { value: 'standard', label: 'Standard — critical 15%, low 25%, warning 40%' },
  { value: 'conservative', label: 'Conservative — critical 25%, low 35%, warning 50%' },
  { value: 'supply', label: 'Supply-critical — critical 10%, low 20%, warning 35%' }
];
const PRESET_VALUES = {
  standard: { critical: 15, low: 25, warning: 40 },
  conservative: { critical: 25, low: 35, warning: 50 },
  supply: { critical: 10, low: 20, warning: 35 }
};

/** Diameter that gives `capacityL` for a cylinder of `heightCm`. */
function diameterFor(capacityL, heightCm) {
  const h = Number(heightCm), v = Number(capacityL);
  if (!(h > 0) || !(v > 0)) return '';
  return (2 * Math.sqrt((v * 1000) / (Math.PI * h))).toFixed(2);
}

function Menu({ label, value, onChange, options, hint }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      {label}
      <select value={value} onChange={onChange}>
        {options.map(o => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      {hint && <small style={{ opacity: 0.7 }}>{hint}</small>}
    </label>
  );
}

function NumberMenu({ label, value, onChange, options, suffix, hint }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      {label}
      <select value={value} onChange={onChange}>
        {options.map(o => <option key={o} value={o}>{o}{suffix ? ` ${suffix}` : ''}</option>)}
      </select>
      {hint && <small style={{ opacity: 0.7 }}>{hint}</small>}
    </label>
  );
}

function LocationMap({ lat, lng, onPick }) {
  const element = useRef(null); const mapRef = useRef(null); const marker = useRef(null); const callback = useRef(onPick); callback.current = onPick;
  useEffect(() => {
    const map = L.map(element.current).setView([-15.4167, 28.2833], 11); mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    map.on('click', e => callback.current(e.latlng.lat.toFixed(7), e.latlng.lng.toFixed(7)));
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    if (!mapRef.current || lat === '' || lng === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return;
    if (marker.current) marker.current.remove();
    marker.current = L.circleMarker([Number(lat), Number(lng)], { radius: 8 }).addTo(mapRef.current);
    mapRef.current.setView([Number(lat), Number(lng)], 14);
  }, [lat, lng]);
  return <div ref={element} style={{ height: 260, marginTop: 12 }} aria-label="Map: click to set the tank location" />;
}

export default function TankInstallation({ stations = [], tanks = [], onSaved }) {
  const [installations, setInstallations] = useState([]);
  const [users, setUsers] = useState([]);
  const [savedId, setSavedId] = useState('');
  const [calHistory, setCalHistory] = useState(null);
  const [distance, setDistance] = useState(''); const [manual, setManual] = useState('');
  const [maxError, setMaxError] = useState('1'); const [calMessage, setCalMessage] = useState('');
  const [replacementId, setReplacementId] = useState(''); const [replacementKey, setReplacementKey] = useState('');
  const [deviceMessage, setDeviceMessage] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState([]);

  const loadInstallations = () => api.get('/installations').then(r => { if (r.success) setInstallations(r.data); });
  const loadHistory = id => api.get(`/installations/${id}/calibration-tests`).then(r => { if (r.success) setCalHistory(r.data); else setCalMessage(r.error); });
  useEffect(() => { loadInstallations(); }, []);
  useEffect(() => { if (savedId) loadHistory(savedId); else setCalHistory(null); }, [savedId]);
  useEffect(() => { api.get('/users').then(r => { if (r.success) setUsers(r.data); }); }, []);

  const stationOptions = [{ value: '', label: 'No station' }, ...stations.map(s => ({ value: s.id, label: `${s.name} · ${s.community || s.district || ''}`.trim() }))];
  const ownerOptions = [{ value: '', label: 'Unassigned' }, ...users.map(u => ({ value: u.id, label: `${u.full_name} · ${u.email} (${u.role})` }))];
  const unconfiguredTanks = tanks.filter(t => !installations.some(i => i.id === t.id));

  // ---------- quick add ----------
  const [quick, setQuick] = useState({ count: '1', station_id: '', owner_id: '', capacity_l: '10000', height_cm: '200', shape: 'vertical_cylinder', provenance: 'SIMULATED', threshold: 'standard', auto_calibrate: true, use_demo_credential: true, name_prefix: '' });
  const setQuickField = (name, value) => setQuick(q => ({ ...q, [name]: value }));
  const quickDiameter = diameterFor(quick.capacity_l, quick.height_cm);
  const quickHeight = Number(quick.height_cm);
  const autoCalibrateAllowed = ['SIMULATED', 'TEST'].includes(quick.provenance);

  const runQuickAdd = async () => {
    const count = Math.max(1, Math.min(20, Number(quick.count) || 1));
    setBusy(true); setCreated([]);
    const thresholds = PRESET_VALUES[quick.threshold];
    const station = stations.find(s => s.id === quick.station_id);
    const results = [];
    for (let i = 1; i <= count; i += 1) {
      setMessage(`Creating tank ${i} of ${count}…`);
      const payload = {
        station_id: quick.station_id || '',
        owner_id: quick.owner_id || '',
        shape: quick.shape,
        height_cm: quickHeight,
        diameter_cm: Number(quickDiameter),
        nominal_capacity_l: Number(quick.capacity_l),
        empty_distance_cm: quickHeight + 10,
        full_distance_cm: 10,
        measurement_offset_cm: 0,
        dead_zone_cm: 0,
        tolerance_cm: 1,
        warning_threshold: thresholds.warning,
        low_threshold: thresholds.low,
        critical_threshold: thresholds.critical,
        hysteresis: 2,
        provenance: quick.provenance,
        mounting_position: 'TOP',
        sensor_model: quick.provenance === 'SIMULATED' ? 'DEMO-TELEMETRY' : 'Other / unknown',
        installer_notes: `Added from the quick-add menu${station ? ` at ${station.name}` : ''}.`,
        auto_calibrate: Boolean(quick.auto_calibrate && autoCalibrateAllowed),
        use_demo_credential: Boolean(quick.use_demo_credential && quick.provenance === 'SIMULATED')
      };
      // Name is optional: the API derives "Tank TANK_00X" when it is omitted, and a
      // prefix lets an operator group tanks added in one sitting.
      if (quick.name_prefix.trim()) payload.name = `${quick.name_prefix.trim()} ${i}`;
      const res = await api.post('/installations', payload);
      if (res.success) results.push({ ...res.data, owner: users.find(u => u.id === quick.owner_id)?.full_name || 'Unassigned' });
      else { setMessage(`Stopped at tank ${i}: ${res.error || 'unknown error'}`); break; }
      setCreated([...results]);
    }
    setCreated(results);
    setBusy(false);
    setMessage(results.length ? `${results.length} tank${results.length === 1 ? '' : 's'} created.${results.some(r => r.device_key) ? ' Copy the device credentials now — they are shown once.' : ''}` : 'Nothing was created.');
    if (results.length) { loadInstallations(); onSaved?.(); }
  };

  // ---------- detailed single installation ----------
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    existing_tank_id: '', name: '', tank_id_code: '', device_id: '', device_key: '',
    station_id: '', owner_id: '', address: '', community: '', latitude: '', longitude: '',
    shape: 'vertical_cylinder', height_cm: '', diameter_cm: '', length_cm: '', width_cm: '', nominal_capacity_l: '',
    empty_distance_cm: '', full_distance_cm: '', measurement_offset_cm: '0', dead_zone_cm: '0', tolerance_cm: '1',
    sensor_model: SENSORS[0], mounting_position: 'TOP', installer_notes: '', provenance: 'UNKNOWN',
    critical_threshold: '15', low_threshold: '25', warning_threshold: '40', hysteresis: '2'
  });
  const set = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const setField = (name, value) => setForm(f => ({ ...f, [name]: value }));
  const field = (name, title, type = 'text', props = {}) => (
    <label style={{ display: 'grid', gap: 4 }}>{title}
      <input name={name} type={type} step={type === 'number' ? 'any' : undefined} value={form[name]} onChange={set} {...props} />
    </label>
  );

  const h = Number(form.height_cm), d = Number(form.diameter_cm), len = Number(form.length_cm), wid = Number(form.width_cm);
  const capacity = form.shape === 'rectangular' ? len * wid * h / 1000 : form.shape === 'horizontal_cylinder' ? Math.PI * (d / 2) ** 2 * len / 1000 : Math.PI * (d / 2) ** 2 * h / 1000;

  const applyCapacityPreset = (capacityL, heightCm) => {
    const dia = diameterFor(capacityL, heightCm);
    setForm(f => ({
      ...f,
      nominal_capacity_l: String(capacityL),
      height_cm: String(heightCm),
      ...(f.shape === 'rectangular' ? {} : { diameter_cm: dia }),
      empty_distance_cm: String(Number(heightCm) + 10),
      full_distance_cm: '10'
    }));
  };

  const submit = async e => {
    e.preventDefault(); setBusy(true); setMessage('Saving…');
    const res = await api.post('/installations', form);
    setBusy(false);
    if (res.success) {
      setSavedId(res.data.id);
      setCreated([res.data]);
      loadInstallations(); onSaved?.();
      setMessage(`${res.data.tank_id_code} saved · ${res.data.installation_status.toLowerCase().replace('_', ' ')} · device ${res.data.device_id}.`);
      setForm(f => ({ ...f, device_key: '' }));
    } else setMessage(res.error || 'Unable to save');
  };

  const copy = async text => { try { await navigator.clipboard.writeText(text); setMessage('Device credential copied to the clipboard.'); } catch { setMessage('Copy failed — select the credential manually.'); } };

  return <div>
    <h1>Install tanks</h1>
    <p>Pick from the menus — tank codes, device identifiers and device credentials are assigned automatically. Nothing is certified as calibrated until it passes manual verification.</p>

    {/* ---------------- quick add ---------------- */}
    <section className="card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Quick add tanks</h2>
      <p style={{ marginTop: 0 }}>Use this to stand up several tanks at one station and hand them to an owner in one go.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
        <NumberMenu label="How many tanks" value={quick.count} onChange={e => setQuickField('count', e.target.value)} options={[1, 2, 3, 4, 5, 6, 8, 10]} hint="Up to 10 at a time" />
        <Menu label="Station" value={quick.station_id} onChange={e => setQuickField('station_id', e.target.value)} options={stationOptions} />
        <Menu label="Assign owner" value={quick.owner_id} onChange={e => setQuickField('owner_id', e.target.value)} options={ownerOptions} />
        <NumberMenu label="Capacity" value={quick.capacity_l} onChange={e => setQuickField('capacity_l', e.target.value)} options={CAPACITY_OPTIONS} suffix="L" />
        <NumberMenu label="Usable height" value={quick.height_cm} onChange={e => setQuickField('height_cm', e.target.value)} options={HEIGHT_OPTIONS} suffix="cm" hint={quickDiameter ? `→ diameter ${quickDiameter} cm` : undefined} />
        <Menu label="Shape" value={quick.shape} onChange={e => setQuickField('shape', e.target.value)} options={SHAPES} />
        <Menu label="Data provenance" value={quick.provenance} onChange={e => setQuickField('provenance', e.target.value)} options={PROVENANCE} />
        <Menu label="Alert thresholds" value={quick.threshold} onChange={e => setQuickField('threshold', e.target.value)} options={THRESHOLD_PRESETS} />
        <label style={{ display: 'grid', gap: 4 }}>Name prefix (optional)
          <input value={quick.name_prefix} onChange={e => setQuickField('name_prefix', e.target.value)} placeholder="Defaults to “Tank TANK_00X”" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>Demo telemetry
          <select value={quick.use_demo_credential ? 'yes' : 'no'} onChange={e => setQuickField('use_demo_credential', e.target.value === 'yes')} disabled={quick.provenance !== 'SIMULATED'}>
            <option value="yes">Yes — feed from DEMO_MODE</option>
            <option value="no">No — issue a device credential</option>
          </select>
          <small style={{ opacity: 0.7 }}>{quick.provenance === 'SIMULATED' ? 'Uses the server’s shared demo key; no credential is issued.' : 'Only for SIMULATED provenance.'}</small>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>Auto-approve calibration
          <select value={quick.auto_calibrate ? 'yes' : 'no'} onChange={e => setQuickField('auto_calibrate', e.target.value === 'yes')} disabled={!autoCalibrateAllowed}>
            <option value="yes" disabled={!autoCalibrateAllowed}>Yes — simulated/test only</option>
            <option value="no">No — calibrate by hand</option>
          </select>
          <small style={{ opacity: 0.7 }}>{autoCalibrateAllowed ? 'Records the low/middle/high tests the verifier needs.' : 'Only available for SIMULATED or TEST provenance.'}</small>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button type="button" onClick={runQuickAdd} disabled={busy}>{busy ? 'Working…' : `Add ${quick.count} tank${Number(quick.count) === 1 ? '' : 's'}`}</button>
        <span role="status">{message}</span>
      </div>

      {created.length > 0 && <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table>
          <thead><tr><th>Tank code</th><th>Name</th><th>Owner</th><th>Capacity</th><th>Device ID</th><th>Device credential</th><th>Status</th></tr></thead>
          <tbody>{created.map(row => <tr key={row.id}>
            <td>{row.tank_id_code}</td>
            <td>{row.name || '—'}</td>
            <td>{row.owner || 'Unassigned'}</td>
            <td>{Number(row.calculated_capacity_l || 0).toFixed(0)} L</td>
            <td>{row.device_id}</td>
            <td>{row.demo_credential ? <em>shared demo credential</em> : (row.device_key ? <><code>{row.device_key}</code> <button type="button" onClick={() => copy(row.device_key)}>Copy</button></> : <em>previously set</em>)}</td>
            <td>{String(row.installation_status || '').replace(/_/g, ' ').toLowerCase()}</td>
          </tr>)}</tbody>
        </table>
        <p><strong>Store these credentials now.</strong> They are returned once at creation and only their hash is kept. Rows marked <em>shared demo credential</em> authenticate with the server's DEMO_MODE key instead, so they never expose one.</p>
      </div>}
    </section>

    {/* ---------------- detailed installation ---------------- */}
    <section className="card" style={{ padding: 20, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Install a single tank in detail</h2>
      <form onSubmit={submit}>
        <p>Step {step + 1} of 5 · {['Tank information', 'Location', 'Geometry', 'Sensor and device', 'Review'][step]}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
          {step === 0 && <>
            <Menu label="Existing tank" value={form.existing_tank_id} onChange={e => setField('existing_tank_id', e.target.value)}
              options={[{ value: '', label: 'Create a new tank' }, ...unconfiguredTanks.map(t => ({ value: t.id, label: `${t.name} · ${t.tank_id_code}` }))]} />
            {form.existing_tank_id
              ? <p>The existing name and station are retained. Its previous device will be revoked; history is preserved.</p>
              : <>
                {field('name', 'Tank name (blank = automatic)')}
                <p style={{ opacity: 0.75 }}>Tank code, device ID and credential are assigned automatically.</p>
              </>}
            <Menu label="Owner" value={form.owner_id} onChange={e => setField('owner_id', e.target.value)} options={ownerOptions} />
            <Menu label="Station" value={form.station_id} onChange={e => setField('station_id', e.target.value)} options={stationOptions} />
            {field('community', 'Community')}
            {field('address', 'Address or landmark')}
          </>}

          {step === 1 && <>
            {field('latitude', 'Latitude', 'number')}
            {field('longitude', 'Longitude', 'number')}
            <p style={{ gridColumn: '1 / -1', opacity: 0.75 }}>Click the map to drop the tank location, or type coordinates.</p>
          </>}

          {step === 2 && <>
            <Menu label="Shape" value={form.shape} onChange={e => setField('shape', e.target.value)} options={SHAPES} />
            <Menu label="Size preset" value="" onChange={e => { const [cap, ht] = e.target.value.split(':'); if (cap) applyCapacityPreset(cap, ht); }}
              options={[{ value: '', label: 'Choose a preset…' }, ...CAPACITY_OPTIONS.flatMap(cap => HEIGHT_OPTIONS.filter(ht => (Math.PI * (Number(diameterFor(cap, ht)) / 2) ** 2 * ht) / 1000 >= 1).slice(0, 2).map(ht => ({ value: `${cap}:${ht}`, label: `${cap} L · ${ht} cm tall (⌀ ${diameterFor(cap, ht)} cm)` })))]}
              hint="Fills the dimensions below" />
            {field('height_cm', 'Usable height (cm)', 'number')}
            {form.shape !== 'rectangular' && field('diameter_cm', 'Internal diameter (cm)', 'number')}
            {form.shape !== 'vertical_cylinder' && field('length_cm', 'Internal length (cm)', 'number')}
            {form.shape === 'rectangular' && field('width_cm', 'Internal width (cm)', 'number')}
            {field('nominal_capacity_l', 'Manufacturer capacity (L), optional', 'number')}
            <p style={{ gridColumn: '1 / -1' }}>Geometric capacity: {capacity > 0 ? `${capacity.toFixed(2)} L` : 'enter dimensions'}{capacity > 0 && Number(form.nominal_capacity_l) > 0 && Math.abs(capacity - Number(form.nominal_capacity_l)) / capacity > .1 && ' — differs from nominal by over 10%; verify dimensions.'}</p>
            <Menu label="Alert thresholds" value={Object.entries(PRESET_VALUES).find(([, v]) => String(v.critical) === form.critical_threshold && String(v.low) === form.low_threshold)?.[0] || 'standard'}
              onChange={e => { const p = PRESET_VALUES[e.target.value]; setForm(f => ({ ...f, critical_threshold: String(p.critical), low_threshold: String(p.low), warning_threshold: String(p.warning) })); }}
              options={THRESHOLD_PRESETS} />
          </>}

          {step === 3 && <>
            <Menu label="Sensor model" value={form.sensor_model} onChange={e => setField('sensor_model', e.target.value)} options={SENSORS} />
            <Menu label="Mounting position" value={form.mounting_position} onChange={e => setField('mounting_position', e.target.value)} options={[{ value: 'TOP', label: 'Top-mounted (only supported option)' }]} />
            {field('empty_distance_cm', 'Empty reference (cm)', 'number', { placeholder: 'Sensor to empty bottom' })}
            {field('full_distance_cm', 'Full reference (cm)', 'number', { placeholder: 'Sensor to full line' })}
            <p style={{ gridColumn: '1 / -1', opacity: 0.75 }}>Empty reference minus full reference must equal the usable height. Defaults assume the sensor sits 10 cm above the maximum fill line.</p>
            {field('measurement_offset_cm', 'Correction added to raw distance (cm)', 'number')}
            {field('dead_zone_cm', 'Sensor dead zone (cm)', 'number')}
            {field('tolerance_cm', 'Measurement tolerance (cm)', 'number')}
            {field('installer_notes', 'Installer notes')}
            <Menu label="Data provenance" value={form.provenance} onChange={e => setField('provenance', e.target.value)} options={PROVENANCE} />
            <details style={{ gridColumn: '1 / -1' }}>
              <summary>Advanced — override automatic identifiers</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14, marginTop: 10 }}>
                {field('tank_id_code', 'Tank identifier (blank = automatic)')}
                {field('device_id', 'Device identifier (blank = automatic)')}
                {field('device_key', 'Device credential (blank = generate)', 'text', { autoComplete: 'new-password', placeholder: '24–256 characters, or leave blank' })}
              </div>
            </details>
          </>}

          {step === 4 && <>
            <p style={{ gridColumn: '1 / -1' }}>
              Tank: {form.existing_tank_id ? tanks.find(t => t.id === form.existing_tank_id)?.name : (form.name || 'Automatic name and code')}<br />
              Owner: {users.find(u => u.id === form.owner_id)?.full_name || 'Unassigned'}<br />
              Station: {stations.find(s => s.id === form.station_id)?.name || 'None'}<br />
              Shape: {SHAPES.find(s => s.value === form.shape)?.label}<br />
              Empty: {form.empty_distance_cm} cm; full: {form.full_distance_cm} cm<br />
              Device: {form.device_id || 'assigned automatically'}<br />
              Status: awaiting calibration unless provenance is SIMULATED/TEST and auto-approval is requested.
            </p>
            <p style={{ gridColumn: '1 / -1', opacity: 0.75 }}>Test against manual measurements before treating this tank as calibrated. A horizontal cylinder currently requires usable height equal to its diameter.</p>
          </>}
        </div>
        {step === 1 && <LocationMap lat={form.latitude} lng={form.longitude} onPick={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))} />}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 4 ? <button type="button" onClick={() => setStep(step + 1)}>Next</button> : <button type="submit" disabled={busy}>Save installation</button>}
        </div>
      </form>
    </section>

    {/* ---------------- existing installations ---------------- */}
    <section className="card" style={{ padding: 20, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Existing installations</h2>
      {installations.length === 0 ? <p>No tanks have been configured yet.</p> : <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Tank</th><th>Name</th><th>Station</th><th>Owner</th><th>Device</th><th>Provenance</th><th>Status</th><th>Calibrated</th></tr></thead>
          <tbody>{installations.map(i => <tr key={i.id}>
            <td>{i.tank_id_code}</td>
            <td>{i.name}</td>
            <td>{i.station_name || '—'}</td>
            <td>{i.owner_name || 'Unassigned'}</td>
            <td>{i.device_id_code || '—'}</td>
            <td>{i.provenance}</td>
            <td>{String(i.installation_status || '').replace(/_/g, ' ').toLowerCase()}</td>
            <td>{i.calibration_date ? new Date(i.calibration_date).toLocaleDateString() : 'Not yet'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p style={{ marginTop: 14 }}><Menu label="Choose a tank for calibration or device work" value={savedId} onChange={e => setSavedId(e.target.value)}
        options={[{ value: '', label: 'Select a tank' }, ...installations.map(i => ({ value: i.id, label: `${i.name} (${i.tank_id_code}) · ${i.installation_status}` }))]} /></p>
    </section>

    {savedId && <section className="card" style={{ padding: 20, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Calibration verification</h2>
      <p>Record readings at low, middle and high fill levels using manual depth measurements. A passing test at each range is required.</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>Sensor distance (cm) <input type="number" step="any" value={distance} onChange={e => setDistance(e.target.value)} /></label>
        <label>Manual depth (cm) <input type="number" step="any" value={manual} onChange={e => setManual(e.target.value)} /></label>
        <button type="button" onClick={async () => {
          if (distance === '' || manual === '') { setCalMessage('Enter both measurements'); return; }
          const r = await api.post(`/installations/${savedId}/calibration-tests`, { distance_cm: Number(distance), manual_depth_cm: Number(manual) });
          setCalMessage(r.success ? `Calculated depth ${r.data.calculated_depth_cm.toFixed(2)} cm; signed error ${r.data.depth_error_cm.toFixed(2)} cm.` : r.error);
          if (r.success) loadHistory(savedId);
        }}>Record test</button>
        <label>Acceptable absolute depth error (cm) <input type="number" step="any" value={maxError} onChange={e => setMaxError(e.target.value)} /></label>
        <button type="button" onClick={async () => {
          const r = await api.post(`/installations/${savedId}/verify-calibration`, { max_error_cm: Number(maxError) });
          setCalMessage(r.success ? 'Calibration verified by administrator.' : r.error);
          if (r.success) { loadHistory(savedId); loadInstallations(); }
        }}>Verify calibration</button>
      </div>
      <p role="status">{calMessage}</p>

      <h3>Replace device</h3>
      <p>Replaces and revokes the previous device; the new device starts offline. Leave the credential blank to have one generated.</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'end' }}>
        <label>New device ID (blank = automatic) <input value={replacementId} onChange={e => setReplacementId(e.target.value)} /></label>
        <label>Credential (blank = generate) <input type="password" autoComplete="new-password" value={replacementKey} onChange={e => setReplacementKey(e.target.value)} /></label>
        <button type="button" onClick={async () => {
          const r = await api.post(`/installations/${savedId}/device`, { device_id: replacementId || undefined, device_key: replacementKey || undefined });
          setDeviceMessage(r.success ? 'Device replaced. The old device is revoked.' : r.error);
          if (r.success) { setReplacementKey(''); setReplacementId(''); onSaved?.(); }
        }}>Replace device</button>
      </div>
      <p role="status">{deviceMessage}</p>

      {calHistory && <>
        <p>State: {calHistory.installation_status} · Verified: {calHistory.calibration_date || 'Not yet'}</p>
        {calHistory.tests.length === 0 ? <p>No calibration tests recorded.</p> : <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Date</th><th>Sensor cm</th><th>Manual depth cm</th><th>Calculated cm</th><th>Error cm</th><th>Recorded by</th></tr></thead>
            <tbody>{calHistory.tests.map(t => <tr key={t.id}><td>{t.created_at}</td><td>{t.raw_distance_cm}</td><td>{t.manual_depth_cm}</td><td>{t.calculated_depth_cm}</td><td>{t.depth_error_cm}</td><td>{t.actor_name || 'Unknown'}</td></tr>)}</tbody>
          </table>
        </div>}
      </>}
    </section>}
  </div>;
}
