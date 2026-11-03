import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const emptyPoint = () => ({ name: '', type: 'BOREHOLE', latitude: '', longitude: '', operational_status: 'UNKNOWN', source: '', verification_status: 'UNVERIFIED', community: '', district: '' });
const PAGE_SIZE = 20;

export default function WaterPointManager({ latitude, longitude, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyPoint);
  const [editing, setEditing] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(0);
  const [list, setList] = useState(null);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setListError('');
    const response = await api.get(`/gis/water-points?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
    if (response.success) setList(response);
    else { setList(null); setListError(response.error || 'Unable to load water points'); }
    setBusy(false);
  }, [page]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  function change(field, value) {
    setForm(previous => ({ ...previous, [field]: value }));
    if (['latitude', 'longitude', 'source', 'verification_status'].includes(field)) setConfirmed(false);
  }
  function reset() { setForm(emptyPoint()); setEditing(null); setConfirmed(false); }
  function edit(point) {
    setEditing(point);
    setForm(Object.fromEntries(Object.keys(emptyPoint()).map(key => [key, point[key] ?? ''])));
    setConfirmed(false); setMessage('');
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setMessage('');
    const payload = { ...form, confirm_verified: confirmed, ...(editing ? { revision: editing.revision } : {}) };
    const response = editing
      ? await api.put(`/gis/water-points/${encodeURIComponent(editing.id)}`, payload)
      : await api.post('/gis/water-points', payload);
    setSaving(false);
    if (!response.success) {
      if (response.status === 409) { await load(); setMessage('This record changed. Select Edit again to review the latest version.'); }
      else setMessage(response.error || 'Could not save water point.');
      return;
    }
    reset(); setMessage('Water point saved. Run the nearby search again to refresh its results.');
    onChanged();
    await load();
  }
  const coordinateChanged = editing?.verification_status === 'VERIFIED' && form.verification_status === 'VERIFIED' &&
    (Number(form.latitude) !== Number(editing.latitude) || Number(form.longitude) !== Number(editing.longitude) || form.source.trim() !== editing.source);

  return <section className="gis-manager">
    <button type="button" className="gis-manager-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close water point management' : 'Manage water points'}</button>
    {open && <div>
      <p>Administrators can record and review real water points. Keep sources and evidence accurate. Verification applies to the location, not water safety or current access.</p>
      <h3>{editing ? 'Edit water point' : 'Add water point'}</h3>
      <form onSubmit={submit} className="gis-point-form">
        <label>Name <input required maxLength="255" value={form.name} onChange={e => change('name', e.target.value)} /></label>
        <label>Type <select value={form.type} onChange={e => change('type', e.target.value)}><option value="BOREHOLE">Borehole</option><option value="KIOSK">Kiosk</option><option value="PUBLIC_TAP">Public tap</option><option value="OTHER">Other</option></select></label>
        <label>Latitude <input required type="number" min="-90" max="90" step="any" value={form.latitude} onChange={e => change('latitude', e.target.value)} /></label>
        <label>Longitude <input required type="number" min="-180" max="180" step="any" value={form.longitude} onChange={e => change('longitude', e.target.value)} /></label>
        <button type="button" onClick={() => { change('latitude', latitude); change('longitude', longitude); }} disabled={!latitude || !longitude}>Use search coordinates</button>
        <label>Community (optional) <input maxLength="100" value={form.community} onChange={e => change('community', e.target.value)} /></label>
        <label>District (optional) <input maxLength="100" value={form.district} onChange={e => change('district', e.target.value)} /></label>
        <label>Recorded operational status <select value={form.operational_status} onChange={e => change('operational_status', e.target.value)}><option value="UNKNOWN">Unknown</option><option value="OPERATIONAL">Operational</option><option value="NOT_OPERATIONAL">Not operational</option></select></label>
        <label className="gis-wide">Source / verification evidence <input required minLength="5" maxLength="500" value={form.source} onChange={e => change('source', e.target.value)} placeholder="For example, survey reference and date" /></label>
        <label>Location review <select value={form.verification_status} onChange={e => change('verification_status', e.target.value)}><option value="UNVERIFIED">Unverified</option><option value="VERIFIED">Verified</option></select></label>
        {form.verification_status === 'VERIFIED' && <label className="gis-check gis-wide"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I have checked the location against the stated source. This does not confirm water quality or access.</label>}
        {coordinateChanged && <p className="gis-wide">Changing a verified location or its source requires saving it as unverified first, then reviewing it again.</p>}
        <div className="gis-actions gis-wide"><button type="submit" disabled={saving || coordinateChanged}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add water point'}</button>{editing && <button type="button" onClick={reset} disabled={saving}>Cancel edit</button>}</div>
      </form>
      <p role="status" aria-live="polite">{message}</p>
      <h3>Water point records</h3>
      {busy && <p role="status">Loading water points…</p>}
      {listError && <p role="alert">{listError} <button type="button" onClick={load}>Retry</button></p>}
      {!busy && list && list.data.length === 0 && <p>No water points on this page.</p>}
      {!busy && list && list.data.length > 0 && <div className="gis-point-list">{list.data.map(point => <article key={point.id}>
        <div><strong>{point.name}</strong> · {point.type.replaceAll('_', ' ')}<br />{point.verification_status} location · {point.operational_status.replaceAll('_', ' ')} status<br /><small>{point.latitude}, {point.longitude} · Source: {point.source} · Updated: {point.updated_at}</small></div>
        <button type="button" onClick={() => edit(point)}>Edit</button>
      </article>)}</div>}
      <div className="gis-actions"><button type="button" disabled={busy || page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1}</span><button type="button" disabled={busy || !list?.meta.hasMore} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </div>}
  </section>;
}
