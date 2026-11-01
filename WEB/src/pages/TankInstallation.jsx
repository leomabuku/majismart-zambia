import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ChevronDown, ClipboardCheck, Copy, Droplet, Gauge, ListChecks, PlusCircle, SlidersHorizontal, Wrench
} from 'lucide-react';
import { api } from '../services/api';
import './install.css';

// Menu-driven tank provisioning.
//
// Admins add tanks in bulk far more often than they measure one tank precisely,
// so the page leads with menus and derived values: pick a station, an owner, how
// many tanks and a size, and the API assigns tank codes, device identifiers and
// device credentials itself. Manual dimensions, custom identifiers and the
// calibration workflow stay available underneath, each in its own collapsible
// section so the page stays readable.

const CAPACITY_OPTIONS = [5000, 10000, 15000, 20000, 25000, 30000, 50000, 100000];
const HEIGHT_OPTIONS = [100, 150, 200, 250, 300];
const SHAPES = [
  { value: 'vertical_cylinder', label: 'Vertical cylinder' },
  { value: 'rectangular', label: 'Rectangular' },
  { value: 'horizontal_cylinder', label: 'Horizontal cylinder' }
];
const SENSORS = ['JSN-SR04T', 'HC-SR04', 'AJ-SR04M', 'DEMO-TELEMETRY', 'Other / unknown'];
const PROVENANCE = [
  { value: 'UNKNOWN', label: 'Real sensor, not yet classified' },
  { value: 'OPERATIONAL', label: 'Operational (real field data)' },
  { value: 'SIMULATED', label: 'Simulated (demo telemetry)' },
  { value: 'TEST', label: 'Test bench' }
];
const THRESHOLD_PRESETS = [
  { value: 'standard', label: 'Standard — 15 / 25 / 40%' },
  { value: 'conservative', label: 'Conservative — 25 / 35 / 50%' },
  { value: 'supply', label: 'Supply-critical — 10 / 20 / 35%' }
];
const PRESET_VALUES = {
  standard: { critical: 15, low: 25, warning: 40 },
  conservative: { critical: 25, low: 35, warning: 50 },
  supply: { critical: 10, low: 20, warning: 35 }
};
const STEPS = ['Tank', 'Location', 'Geometry', 'Sensor', 'Review'];

/** Diameter that gives `capacityL` for a cylinder of `heightCm`. */
function diameterFor(capacityL, heightCm) {
  const h = Number(heightCm), v = Number(capacityL);
  if (!(h > 0) || !(v > 0)) return '';
  return (2 * Math.sqrt((v * 1000) / (Math.PI * h))).toFixed(2);
}

const statusClass = status => (status === 'CALIBRATED' ? 'ok' : status === 'AWAITING_CALIBRATION' ? 'warn' : 'muted');
const statusLabel = status => String(status || '').replace(/_/g, ' ').toLowerCase();

function Field({ label, hint, chip, children }) {
  return (
    <label className="inst-field">
      <span>{label}</span>
      {children}
      {chip && <span className="inst-chip">{chip}</span>}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}>
      {options.map(o => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

function Section({ id, icon, title, subtitle, count, open, onToggle, children }) {
  return (
    <section className="inst-section" data-open={open}>
      <button type="button" className="inst-section-head" onClick={onToggle} aria-expanded={open} aria-controls={`inst-${id}`}>
        <span className="inst-section-icon">{icon}</span>
        <span className="inst-section-title">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        {count != null && <span className="inst-count">{count}</span>}
        <ChevronDown size={20} className="inst-chevron" aria-hidden="true" />
      </button>
      {open && <div className="inst-section-body" id={`inst-${id}`}>{children}</div>}
    </section>
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
  return <div ref={element} style={{ height: 260, marginTop: 4, borderRadius: 10, overflow: 'hidden' }} aria-label="Map: click to set the tank location" />;
}

export default function TankInstallation({ stations = [], tanks = [], onSaved }) {
  const [installations, setInstallations] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState('quick');
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

  const toggle = id => setOpen(current => (current === id ? '' : id));
  const stationOptions = [{ value: '', label: 'No station' }, ...stations.map(s => ({ value: s.id, label: `${s.name} · ${s.community || s.district || ''}`.trim() }))];
  const ownerOptions = [{ value: '', label: 'Unassigned' }, ...users.map(u => ({ value: u.id, label: `${u.full_name} · ${u.role}` }))];
  const unconfiguredTanks = tanks.filter(t => !installations.some(i => i.id === t.id));
  const calibrated = installations.filter(i => i.installation_status === 'CALIBRATED').length;
  const withOwner = installations.filter(i => i.owner_id).length;

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
    <Field label={title}>
      <input name={name} type={type} step={type === 'number' ? 'any' : undefined} value={form[name]} onChange={set} {...props} />
    </Field>
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
  const sizePresetOptions = [
    { value: '', label: 'Choose a preset…' },
    ...CAPACITY_OPTIONS.flatMap(cap => HEIGHT_OPTIONS.slice(0, 3).map(ht => ({
      value: `${cap}:${ht}`, label: `${cap} L · ${ht} cm tall (⌀ ${diameterFor(cap, ht)} cm)`
    })))
  ];

  const submit = async e => {
    e.preventDefault(); setBusy(true); setMessage('Saving…');
    const res = await api.post('/installations', form);
    setBusy(false);
    if (res.success) {
      setSavedId(res.data.id);
      setCreated([res.data]);
      loadInstallations(); onSaved?.();
      setMessage(`${res.data.tank_id_code} saved · ${statusLabel(res.data.installation_status)} · device ${res.data.device_id}.`);
      setForm(f => ({ ...f, device_key: '' }));
    } else setMessage(res.error || 'Unable to save');
  };

  const copy = async text => { try { await navigator.clipboard.writeText(text); setMessage('Device credential copied to the clipboard.'); } catch { setMessage('Copy failed — select the credential manually.'); } };
  const selectTank = id => { setSavedId(id); setOpen('calibration'); };

  return <div className="inst-page">
    <header className="inst-head">
      <div>
        <h1>Install tanks</h1>
        <p>Tank codes, device identifiers and credentials are assigned automatically. Nothing is certified as calibrated until it passes manual verification.</p>
      </div>
      <div className="inst-summary">
        <span><strong>{installations.length}</strong> configured</span>
        <span><strong>{calibrated}</strong> calibrated</span>
        <span><strong>{installations.length - calibrated}</strong> pending</span>
        <span><strong>{withOwner}</strong> with owner</span>
      </div>
    </header>

    {/* ---------------- quick add ---------------- */}
    <Section id="quick" open={open === 'quick'} onToggle={() => toggle('quick')}
      icon={<PlusCircle size={19} />} title="Quick add tanks"
      subtitle="Several tanks at one station, handed to an owner in one step">
      <div className="inst-grid">
        <Field label="How many">
          <Select value={quick.count} onChange={e => setQuickField('count', e.target.value)} options={[1, 2, 3, 4, 5, 6, 8, 10]} />
        </Field>
        <Field label="Station">
          <Select value={quick.station_id} onChange={e => setQuickField('station_id', e.target.value)} options={stationOptions} />
        </Field>
        <Field label="Assign owner">
          <Select value={quick.owner_id} onChange={e => setQuickField('owner_id', e.target.value)} options={ownerOptions} />
        </Field>
        <Field label="Capacity">
          <Select value={quick.capacity_l} onChange={e => setQuickField('capacity_l', e.target.value)} options={CAPACITY_OPTIONS.map(v => ({ value: String(v), label: `${v.toLocaleString()} L` }))} />
        </Field>
        <Field label="Usable height" chip={quickDiameter ? `⌀ ${quickDiameter} cm` : null}>
          <Select value={quick.height_cm} onChange={e => setQuickField('height_cm', e.target.value)} options={HEIGHT_OPTIONS.map(v => ({ value: String(v), label: `${v} cm` }))} />
        </Field>
        <Field label="Shape">
          <Select value={quick.shape} onChange={e => setQuickField('shape', e.target.value)} options={SHAPES} />
        </Field>
        <Field label="Data provenance">
          <Select value={quick.provenance} onChange={e => setQuickField('provenance', e.target.value)} options={PROVENANCE} />
        </Field>
        <Field label="Alert thresholds">
          <Select value={quick.threshold} onChange={e => setQuickField('threshold', e.target.value)} options={THRESHOLD_PRESETS} />
        </Field>
        <Field label="Name prefix" hint="Optional — otherwise “Tank TANK_00X”">
          <input value={quick.name_prefix} onChange={e => setQuickField('name_prefix', e.target.value)} placeholder="e.g. Chilenje Phase 2" />
        </Field>
        <Field label="Demo telemetry" hint={quick.provenance === 'SIMULATED' ? 'Uses the server’s shared demo key; no credential issued.' : 'Only for simulated tanks.'}>
          <Select value={quick.use_demo_credential ? 'yes' : 'no'} disabled={quick.provenance !== 'SIMULATED'}
            onChange={e => setQuickField('use_demo_credential', e.target.value === 'yes')}
            options={[{ value: 'yes', label: 'Feed from DEMO_MODE' }, { value: 'no', label: 'Issue a device credential' }]} />
        </Field>
        <Field label="Auto-approve calibration" hint={autoCalibrateAllowed ? 'Records the low/middle/high tests the verifier needs.' : 'Only for simulated or test tanks.'}>
          <Select value={quick.auto_calibrate ? 'yes' : 'no'} disabled={!autoCalibrateAllowed}
            onChange={e => setQuickField('auto_calibrate', e.target.value === 'yes')}
            options={[{ value: 'yes', label: 'Yes — simulated/test only' }, { value: 'no', label: 'No — calibrate by hand' }]} />
        </Field>
      </div>

      <div className="inst-actions">
        <button type="button" className="inst-primary" onClick={runQuickAdd} disabled={busy}>
          <PlusCircle size={16} /> {busy ? 'Working…' : `Add ${quick.count} tank${Number(quick.count) === 1 ? '' : 's'}`}
        </button>
        <span className="inst-status" role="status">{message}</span>
      </div>

      {created.length > 0 && <div className="inst-table-wrap">
        <table className="inst-table">
          <thead><tr><th>Tank</th><th>Name</th><th>Owner</th><th>Capacity</th><th>Device</th><th>Credential</th><th>Status</th></tr></thead>
          <tbody>{created.map(row => <tr key={row.id}>
            <td><strong>{row.tank_id_code}</strong></td>
            <td>{row.name || '—'}</td>
            <td>{row.owner || 'Unassigned'}</td>
            <td className="inst-mono">{Number(row.calculated_capacity_l || 0).toFixed(0)} L</td>
            <td>{row.device_id}</td>
            <td>{row.demo_credential ? <span className="inst-pill muted">shared demo key</span>
              : (row.device_key ? <><code>{row.device_key}</code>{' '}<button type="button" className="inst-copy" onClick={() => copy(row.device_key)}><Copy size={11} /> Copy</button></> : <em>previously set</em>)}</td>
            <td><span className={`inst-pill ${statusClass(row.installation_status)}`}>{statusLabel(row.installation_status)}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {created.some(r => r.device_key) && <p className="inst-note is-warn"><strong>Store these credentials now.</strong> They are returned once and only their hash is kept.</p>}
    </Section>

    {/* ---------------- detailed installation ---------------- */}
    <Section id="detail" open={open === 'detail'} onToggle={() => toggle('detail')}
      icon={<SlidersHorizontal size={19} />} title="Install a single tank in detail"
      subtitle="Measured geometry, sensor and device provisioning, step by step">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="inst-steps">
          {STEPS.map((label, index) => (
            <button key={label} type="button" aria-current={index === step ? 'step' : undefined}
              onClick={() => setStep(index)} disabled={index > step + 3}>
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 && <div className="inst-grid">
          <Field label="Existing tank" hint={form.existing_tank_id ? 'Name and station are retained; the previous device is revoked.' : null}>
            <Select value={form.existing_tank_id} onChange={e => setField('existing_tank_id', e.target.value)}
              options={[{ value: '', label: 'Create a new tank' }, ...unconfiguredTanks.map(t => ({ value: t.id, label: `${t.name} · ${t.tank_id_code}` }))]} />
          </Field>
          <Field label="Owner">
            <Select value={form.owner_id} onChange={e => setField('owner_id', e.target.value)} options={ownerOptions} />
          </Field>
          <Field label="Station">
            <Select value={form.station_id} onChange={e => setField('station_id', e.target.value)} options={stationOptions} />
          </Field>
          {!form.existing_tank_id && <Field label="Tank name" hint="Blank = derived from the assigned code">
            <input name="name" value={form.name} onChange={set} />
          </Field>}
          <Field label="Community"><input name="community" value={form.community} onChange={set} /></Field>
          <Field label="Address or landmark"><input name="address" value={form.address} onChange={set} /></Field>
        </div>}

        {step === 1 && <>
          <div className="inst-grid">
            {field('latitude', 'Latitude', 'number')}
            {field('longitude', 'Longitude', 'number')}
          </div>
          <LocationMap lat={form.latitude} lng={form.longitude} onPick={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))} />
          <p className="inst-note">Click the map to drop the tank location, or type the coordinates.</p>
        </>}

        {step === 2 && <>
          <div className="inst-grid">
            <Field label="Shape">
              <Select value={form.shape} onChange={e => setField('shape', e.target.value)} options={SHAPES} />
            </Field>
            <Field label="Size preset" hint="Fills the dimensions below">
              <Select value="" onChange={e => { const [cap, ht] = e.target.value.split(':'); if (cap) applyCapacityPreset(cap, ht); }} options={sizePresetOptions} />
            </Field>
            {field('height_cm', 'Usable height (cm)', 'number')}
            {form.shape !== 'rectangular' && field('diameter_cm', 'Internal diameter (cm)', 'number')}
            {form.shape !== 'vertical_cylinder' && field('length_cm', 'Internal length (cm)', 'number')}
            {form.shape === 'rectangular' && field('width_cm', 'Internal width (cm)', 'number')}
            {field('nominal_capacity_l', 'Manufacturer capacity (L)', 'number')}
            <Field label="Alert thresholds">
              <Select value={Object.entries(PRESET_VALUES).find(([, v]) => String(v.critical) === form.critical_threshold && String(v.low) === form.low_threshold)?.[0] || 'standard'}
                onChange={e => { const p = PRESET_VALUES[e.target.value]; setForm(f => ({ ...f, critical_threshold: String(p.critical), low_threshold: String(p.low), warning_threshold: String(p.warning) })); }}
                options={THRESHOLD_PRESETS} />
            </Field>
          </div>
          <p className="inst-note">Geometric capacity: {capacity > 0 ? `${capacity.toFixed(2)} L` : 'enter dimensions'}
            {capacity > 0 && Number(form.nominal_capacity_l) > 0 && Math.abs(capacity - Number(form.nominal_capacity_l)) / capacity > .1 && <span className="is-warn"> — differs from nominal by over 10%; verify the dimensions.</span>}
          </p>
        </>}

        {step === 3 && <>
          <div className="inst-grid">
            <Field label="Sensor model">
              <Select value={form.sensor_model} onChange={e => setField('sensor_model', e.target.value)} options={SENSORS} />
            </Field>
            <Field label="Mounting position">
              <Select value={form.mounting_position} onChange={e => setField('mounting_position', e.target.value)} options={[{ value: 'TOP', label: 'Top-mounted (only supported)' }]} />
            </Field>
            {field('empty_distance_cm', 'Empty reference (cm)', 'number', { placeholder: 'Sensor to empty bottom' })}
            {field('full_distance_cm', 'Full reference (cm)', 'number', { placeholder: 'Sensor to full line' })}
            {field('measurement_offset_cm', 'Correction added to raw distance (cm)', 'number')}
            {field('dead_zone_cm', 'Sensor dead zone (cm)', 'number')}
            {field('tolerance_cm', 'Measurement tolerance (cm)', 'number')}
            {field('installer_notes', 'Installer notes')}
            <Field label="Data provenance">
              <Select value={form.provenance} onChange={e => setField('provenance', e.target.value)} options={PROVENANCE} />
            </Field>
          </div>
          <p className="inst-note">Empty reference minus full reference must equal the usable height. The value 10 cm is used when the sensor sits just above the maximum fill line.</p>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Advanced — override the automatic identifiers</summary>
            <div className="inst-grid" style={{ marginTop: 12 }}>
              {field('tank_id_code', 'Tank identifier (blank = automatic)')}
              {field('device_id', 'Device identifier (blank = automatic)')}
              {field('device_key', 'Device credential (blank = generate)', 'text', { autoComplete: 'new-password', placeholder: '24–256 characters' })}
            </div>
          </details>
        </>}

        {step === 4 && <>
          <div className="inst-grid">
            <Field label="Tank"><input readOnly value={form.existing_tank_id ? (tanks.find(t => t.id === form.existing_tank_id)?.name || '') : (form.name || 'Automatic name and code')} /></Field>
            <Field label="Owner"><input readOnly value={users.find(u => u.id === form.owner_id)?.full_name || 'Unassigned'} /></Field>
            <Field label="Station"><input readOnly value={stations.find(s => s.id === form.station_id)?.name || 'None'} /></Field>
            <Field label="Shape"><input readOnly value={SHAPES.find(s => s.value === form.shape)?.label || ''} /></Field>
            <Field label="Empty / full reference"><input readOnly value={`${form.empty_distance_cm || '—'} cm / ${form.full_distance_cm || '—'} cm`} /></Field>
            <Field label="Device"><input readOnly value={form.device_id || 'assigned automatically'} /></Field>
          </div>
          <p className="inst-note">Status: awaiting calibration unless the provenance is simulated/test and auto-approval is requested. A horizontal cylinder currently requires usable height equal to its diameter.</p>
        </>}

        <div className="inst-wizard-foot">
          <div>
            {step > 0 && <button type="button" className="inst-secondary" onClick={() => setStep(step - 1)}>Back</button>}
          </div>
          <div className="inst-actions" style={{ paddingTop: 0 }}>
            {step < 4
              ? <button type="button" className="inst-primary" onClick={() => setStep(step + 1)}>Next</button>
              : <button type="submit" className="inst-primary" disabled={busy}><ClipboardCheck size={16} /> Save installation</button>}
          </div>
        </div>
        {message && <p className="inst-note" role="status">{message}</p>}
      </form>
    </Section>

    {/* ---------------- existing installations ---------------- */}
    <Section id="existing" open={open === 'existing'} onToggle={() => toggle('existing')}
      icon={<ListChecks size={19} />} title="Existing installations" count={installations.length}
      subtitle="Pick a tank to calibrate it or work on its device">
      {installations.length === 0 ? <p className="inst-empty">No tanks have been configured yet.</p> : <div className="inst-table-wrap">
        <table className="inst-table">
          <thead><tr><th>Tank</th><th>Name</th><th>Station</th><th>Owner</th><th>Device</th><th>Provenance</th><th>Status</th><th /></tr></thead>
          <tbody>{installations.map(i => <tr key={i.id} data-selected={i.id === savedId}>
            <td><strong>{i.tank_id_code}</strong></td>
            <td>{i.name}</td>
            <td>{i.station_name || '—'}</td>
            <td>{i.owner_name || <span className="inst-pill muted">unassigned</span>}</td>
            <td>{i.device_id_code || '—'}</td>
            <td>{i.provenance}</td>
            <td><span className={`inst-pill ${statusClass(i.installation_status)}`}>{statusLabel(i.installation_status)}</span></td>
            <td><button type="button" className="inst-copy" onClick={() => selectTank(i.id)}>Select</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Section>

    {/* ---------------- calibration ---------------- */}
    <Section id="calibration" open={open === 'calibration'} onToggle={() => { if (savedId) toggle('calibration'); }}
      icon={<Gauge size={19} />} title="Calibration & device"
      subtitle={savedId ? (installations.find(i => i.id === savedId)?.name || 'Selected tank') : 'Select a tank in the table above first'}>
      {!savedId ? <p className="inst-empty">Choose a tank from “Existing installations” to record measurements or replace its device.</p> : <>
        <div className="inst-panel">
          <h4>Record a measurement</h4>
          <div className="inst-grid">
            <Field label="Sensor distance (cm)"><input type="number" step="any" value={distance} onChange={e => setDistance(e.target.value)} /></Field>
            <Field label="Manual depth (cm)"><input type="number" step="any" value={manual} onChange={e => setManual(e.target.value)} /></Field>
            <Field label="Acceptable error (cm)" hint="Used when verifying">
              <input type="number" step="any" value={maxError} onChange={e => setMaxError(e.target.value)} />
            </Field>
          </div>
          <div className="inst-actions" style={{ paddingTop: 0 }}>
            <button type="button" className="inst-secondary" onClick={async () => {
              if (distance === '' || manual === '') { setCalMessage('Enter both measurements'); return; }
              const r = await api.post(`/installations/${savedId}/calibration-tests`, { distance_cm: Number(distance), manual_depth_cm: Number(manual) });
              setCalMessage(r.success ? `Calculated depth ${r.data.calculated_depth_cm.toFixed(2)} cm; signed error ${r.data.depth_error_cm.toFixed(2)} cm.` : r.error);
              if (r.success) loadHistory(savedId);
            }}>Record test</button>
            <button type="button" className="inst-primary" onClick={async () => {
              const r = await api.post(`/installations/${savedId}/verify-calibration`, { max_error_cm: Number(maxError) });
              setCalMessage(r.success ? 'Calibration verified by administrator.' : r.error);
              if (r.success) { loadHistory(savedId); loadInstallations(); }
            }}><ClipboardCheck size={16} /> Verify calibration</button>
          </div>
          {calMessage && <p className="inst-note" role="status">{calMessage}</p>}
        </div>

        <div className="inst-panel">
          <h4>Replace device</h4>
          <p className="inst-note">The previous device is revoked and the new one starts offline. Leave the credential blank to have one generated.</p>
          <div className="inst-grid">
            <Field label="New device ID"><input value={replacementId} onChange={e => setReplacementId(e.target.value)} placeholder="blank = automatic" /></Field>
            <Field label="Credential"><input type="password" autoComplete="new-password" value={replacementKey} onChange={e => setReplacementKey(e.target.value)} placeholder="blank = generate" /></Field>
          </div>
          <div className="inst-actions" style={{ paddingTop: 0 }}>
            <button type="button" className="inst-secondary" onClick={async () => {
              const r = await api.post(`/installations/${savedId}/device`, { device_id: replacementId || undefined, device_key: replacementKey || undefined });
              setDeviceMessage(r.success ? 'Device replaced. The old device is revoked.' : r.error);
              if (r.success) { setReplacementKey(''); setReplacementId(''); onSaved?.(); }
            }}><Wrench size={16} /> Replace device</button>
            {deviceMessage && <span className="inst-status" role="status">{deviceMessage}</span>}
          </div>
        </div>

        {calHistory && <div className="inst-panel">
          <h4><Droplet size={15} style={{ verticalAlign: '-2px' }} /> History</h4>
          <p className="inst-note">
            State: <span className={`inst-pill ${statusClass(calHistory.installation_status)}`}>{statusLabel(calHistory.installation_status)}</span>
            {' '}· Verified: {calHistory.calibration_date ? new Date(calHistory.calibration_date).toLocaleString() : 'not yet'}
          </p>
          {calHistory.tests.length === 0 ? <p className="inst-note">No calibration tests recorded.</p> : <div className="inst-table-wrap">
            <table className="inst-table">
              <thead><tr><th>Date</th><th>Sensor cm</th><th>Manual depth cm</th><th>Calculated cm</th><th>Error cm</th><th>Recorded by</th></tr></thead>
              <tbody>{calHistory.tests.map(t => <tr key={t.id}>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td className="inst-mono">{t.raw_distance_cm}</td>
                <td className="inst-mono">{t.manual_depth_cm}</td>
                <td className="inst-mono">{t.calculated_depth_cm}</td>
                <td className="inst-mono">{t.depth_error_cm}</td>
                <td>{t.actor_name || 'Unknown'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        </div>}
      </>}
    </Section>
  </div>;
}
