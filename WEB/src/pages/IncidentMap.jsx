import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api } from '../services/api';
import WaterPointManager from '../components/WaterPointManager';
import { nearbyQueryStrings } from '../utils/gisSearch';
import { escapeHtml, directionsUrl, formatAccuracy, formatCoords, hasPin, geoJsonPointToLeaflet, gisSearchOrigins } from '../utils/geo';

export default function IncidentMap({ stations, tanks, reports, isAdmin }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);
  const gisLayer = useRef(null);
  const requestVersion = useRef(0);

  const [showStations, setShowStations] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('5000');
  const [operationalStatus, setOperationalStatus] = useState('ALL');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showWaterPoints, setShowWaterPoints] = useState(true);
  const [showNearbyReports, setShowNearbyReports] = useState(true);

  const origins = gisSearchOrigins(stations, tanks);
  function selectOrigin(key) {
    const origin = origins.find(item => item.key === key);
    if (!origin) return;
    setLatitude(String(origin.latitude)); setLongitude(String(origin.longitude));
    mapInstance.current?.setView([origin.latitude, origin.longitude], Math.max(mapInstance.current.getZoom(), 13));
  }
  function showFeature(feature) {
    const position = geoJsonPointToLeaflet(feature);
    if (!position || !mapInstance.current) return;
    mapInstance.current.setView(position, Math.max(mapInstance.current.getZoom(), 15));
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function searchNearby(event) {
    event.preventDefault();
    const version = ++requestVersion.current;
    setLoading(true); setResults(null);
    const queries = nearbyQueryStrings({ latitude, longitude, radius, operationalStatus });
    const [water, incidents] = await Promise.all([
      api.get(`/gis/nearby/water-points?${queries.water}`), api.get(`/gis/nearby/reports?${queries.reports}`)
    ]);
    if (version !== requestVersion.current) return;
    setResults({ water, incidents }); setLoading(false);
  }

  useEffect(() => () => { requestVersion.current++; mapInstance.current?.remove(); mapInstance.current = null; }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      // Default to Lusaka center: -15.4167, 28.2833
      const map = L.map(mapRef.current).setView([-15.4167, 28.2833], 12);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(map);

      markersLayer.current = L.layerGroup().addTo(map);
      gisLayer.current = L.layerGroup().addTo(map);
      if (isAdmin) map.on('click', event => {
        setLatitude(event.latlng.lat.toFixed(6)); setLongitude(event.latlng.lng.toFixed(6));
      });
      mapInstance.current = map;
    }

    // Refresh markers
    const layer = markersLayer.current;
    if (layer) {
      layer.clearLayers();

      // 1. Add Monitoring Station & Tank Markers
      if (showStations && stations) {
        stations.forEach(station => {
          if (!hasPin(station)) return;

          // A station location is not a tank measurement or a tank location.
          const icon = L.divIcon({className:'custom-station-pin', html:'<div style="background:#64748b;color:white;border:2px solid white;border-radius:50%;width:28px;height:28px;text-align:center;line-height:24px">S</div>', iconSize:[28,28], iconAnchor:[14,14]});
          const marker = L.marker([station.latitude, station.longitude], { icon });
          marker.bindPopup(`<strong>${escapeHtml(station.name)}</strong><br>Station: ${escapeHtml(station.code)}<br>${escapeHtml(station.community)}`);
          marker.addTo(layer);
        });
      }

      // Plot only valid stored coordinates; the location itself is not verified. Never substitute a station pin.
      if (showStations && tanks) tanks.filter(hasPin).forEach(tank => {
        const status = tank.device_status === 'OFFLINE' ? 'OFFLINE' : tank.device_status === 'ERROR' || tank.current_status === 'SENSOR_ERROR' ? 'SENSOR_ERROR' : (tank.current_condition || tank.current_status || 'UNKNOWN');
        const marker = L.circleMarker([Number(tank.latitude), Number(tank.longitude)], {radius: 9, color: status === 'CRITICAL' ? '#dc2626' : status === 'LOW' || status === 'WARNING' ? '#d97706' : status === 'OFFLINE' || status === 'SENSOR_ERROR' ? '#64748b' : '#0284c7'});
        const level = tank.last_reading_at && Number.isFinite(Number(tank.current_water_percent)) ? `${Number(tank.current_water_percent).toFixed(1)}% (last known)` : 'No reading';
        marker.bindPopup(`<strong>${escapeHtml(tank.name)}</strong><br>Tank: ${escapeHtml(tank.tank_id_code)}<br>Level: ${escapeHtml(level)}<br>Condition: ${escapeHtml(status)}<br>Last reading: ${escapeHtml(tank.last_reading_at || 'Never')}`);
        marker.addTo(layer);
      });

      // 2. Add Community Report Incident Markers
      if (showReports && reports) {
        reports.forEach(rep => {
          if (!hasPin(rep)) return;

          const isResolved = rep.status === 'RESOLVED';
          const icon = L.divIcon({
            className: 'custom-incident-pin',
            html: `
              <div style="
                background: ${isResolved ? '#10B981' : '#E11D48'};
                width: 26px;
                height: 26px;
                border-radius: 6px;
                border: 2px solid white;
                box-shadow: 0 3px 6px rgba(0,0,0,0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 12px;
                font-weight: bold;
              ">
                !
              </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });

          const accuracy = formatAccuracy(rep.location_accuracy_m);
          const photo = typeof rep.image_url === 'string' && rep.image_url
            ? `<a href="${escapeHtml(rep.image_url)}" target="_blank" rel="noreferrer" style="display:block;margin-top:8px;">
                 <img src="${escapeHtml(rep.image_url)}" alt="Evidence" style="width:100%;max-width:220px;border-radius:8px;border:1px solid #E2E8F0;" />
               </a>`
            : '';

          const marker = L.marker([rep.latitude, rep.longitude], { icon });
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; min-width: 210px;">
              <strong style="color: #991B1B;">${escapeHtml(rep.title)}</strong><br>
              <span style="color: #64748B;">${escapeHtml(rep.category.replace('_', ' '))} • ${escapeHtml(rep.location_name)}</span>
              <p style="margin: 6px 0; font-size: 12px; color: #334155;">${escapeHtml(rep.description)}</p>
              <div style="font-size: 11px; color: #94A3B8;">${formatCoords(rep.latitude, rep.longitude)}${accuracy ? ' · ' + accuracy : ''}</div>
              <div style="margin-top: 4px;">Status: <strong>${escapeHtml(rep.status)}</strong></div>
              ${photo}
              <a href="${directionsUrl(rep.latitude, rep.longitude)}" target="_blank" rel="noreferrer"
                 style="display:inline-block;margin-top:8px;padding:6px 10px;background:#0077B6;color:#fff;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
                Directions
              </a>
            </div>
          `);
          marker.addTo(layer);
        });
      }
    }
  }, [stations, tanks, reports, showStations, showReports]);

  useEffect(() => {
    const layer = gisLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const meta = results?.water?.success ? results.water.meta : results?.incidents?.success ? results.incidents.meta : null;
    if (meta) {
      L.circle([meta.latitude, meta.longitude], { radius: meta.radiusMeters, color: '#475569', weight: 1, dashArray: '5 5', fillOpacity: 0.03 })
        .bindPopup('Search radius only — not a service boundary').addTo(layer);
    }
    for (const [response, visible, color, label] of [
      [results?.water, showWaterPoints, '#0f766e', 'Water point'],
      [results?.incidents, showNearbyReports, '#7c3aed', 'Nearby report']
    ]) {
      if (!visible || !response?.success) continue;
      for (const feature of response.data.features) {
        const pos = geoJsonPointToLeaflet(feature);
        if (!pos) continue;
        const p = feature.properties;
        const detail = label === 'Water point'
          ? `${escapeHtml(p.name)}<br>Type: ${escapeHtml(p.type)}<br>Recorded status: ${escapeHtml(p.operational_status)}<br>Record updated: ${escapeHtml(p.updated_at || 'Unknown')}<br>Source: ${escapeHtml(p.source)}<br>Location verified; current access and safety not confirmed`
          : `${escapeHtml(p.category)}<br>Status: ${escapeHtml(p.status)}<br>Provenance: ${escapeHtml(p.provenance)} (not independently verified)`;
        L.circleMarker(pos, { radius: 11, color, weight: 3, fillOpacity: 0.3 })
          .bindPopup(`<strong>${label}</strong><br>${detail}<br>Distance: ${Math.round(p.distance_meters)} m straight-line`).addTo(layer);
      }
    }
  }, [results, showWaterPoints, showNearbyReports]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.375rem', color: '#03045E' }}>Geographic Infrastructure & Incidents</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748B' }}>Stored locations of stations, tanks and citizen reports; locations and statuses may be unverified or simulated.</p>
        </div>

        {/* Map Layers Filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'white', padding: '6px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showStations} 
              onChange={e => setShowStations(e.target.checked)} 
            />
            <span style={{ fontWeight: 600, color: '#0284C7' }}>Stations & Tanks ({stations?.length || 0} / {tanks?.length || 0})</span>
          </label>

          <span style={{ color: '#CBD5E1' }}>|</span>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showReports} 
              onChange={e => setShowReports(e.target.checked)} 
            />
            <span style={{ fontWeight: 600, color: '#E11D48' }}>Community Incidents ({reports?.length || 0})</span>
          </label>
        </div>
      </div>

      {isAdmin && <section className="gis-search" aria-label="Nearby search">
        <h3>Nearby search</h3>
        <p>Choose a stored station or tank, click the map, or enter coordinates. Stored asset locations can be unverified or simulated. Distances are straight-line estimates, not proof of access, water quality, service coverage or current operation.</p>
        <label className="gis-origin">Search around a stored asset
          <select value="" onChange={e => selectOrigin(e.target.value)} disabled={!origins.length}>
            <option value="">{origins.length ? 'Choose a station or tank' : 'No assets with stored coordinates'}</option>
            {origins.map(origin => <option key={origin.key} value={origin.key}>{origin.kind === 'tank' ? 'Tank' : 'Station'}: {origin.name}{origin.code ? ` (${origin.code})` : ''}</option>)}
          </select>
        </label>
        <form onSubmit={searchNearby} className="gis-form">
          <label>Latitude <input required type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} /></label>
          <label>Longitude <input required type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
          <label>Radius (metres) <input required type="number" min="1" max="50000" step="any" value={radius} onChange={e => setRadius(e.target.value)} /></label>
          <label>Water point recorded status <select value={operationalStatus} onChange={e => setOperationalStatus(e.target.value)}>
            <option value="ALL">All statuses</option><option value="OPERATIONAL">Recorded operational</option><option value="NOT_OPERATIONAL">Recorded not operational</option><option value="UNKNOWN">Unknown</option>
          </select></label>
          <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Find nearby'}</button>
        </form>
        <div className="gis-toggles">
          <label><input type="checkbox" checked={showWaterPoints} onChange={e => setShowWaterPoints(e.target.checked)} /> Verified water points</label>
          <label><input type="checkbox" checked={showNearbyReports} onChange={e => setShowNearbyReports(e.target.checked)} /> Nearby reports</label>
        </div>
        <div role="status" aria-live="polite">
          {loading && 'Searching nearby locations…'}
          {!loading && results && (results.water.success || results.incidents.success) && <p>Last search: {formatCoords((results.water.success ? results.water : results.incidents).meta.latitude, (results.water.success ? results.water : results.incidents).meta.longitude)} · {(results.water.success ? results.water : results.incidents).meta.radiusMeters} m radius</p>}
          {!loading && results?.water.success && <p>Water-point status filter: {results.water.meta.operationalStatus ? results.water.meta.operationalStatus.replaceAll('_', ' ') : 'All statuses'} (recorded status may be out of date).</p>}
          {!loading && results && [ ['Water points', results.water], ['Reports', results.incidents] ].map(([label, response]) =>
            <p key={label}>{label}: {response.success ? `${response.data.features.length} found${response.meta.truncated ? ' (limit reached)' : ''}` : `Unavailable — ${response.error || 'request failed'}`}</p>)}
        </div>
        {!loading && results && <div className="gis-results" aria-label="Nearby search results">
          {[[results.water, showWaterPoints, 'Verified water points'], [results.incidents, showNearbyReports, 'Nearby reports']].map(([response, visible, label]) => {
            if (!visible || !response?.success || !response.data.features.length) return null;
            return <details key={label}><summary>{label} ({response.data.features.length})</summary>
              <ul>{response.data.features.map(feature => {
                const p = feature.properties;
                const point = label === 'Verified water points';
                return <li key={p.id}><div><strong>{point ? p.name : String(p.category || 'Report').replaceAll('_', ' ')}</strong>
                  {' · '}{Math.round(p.distance_meters)} m straight-line<br />
                  {point ? <>Recorded status: {p.operational_status} · Record updated: {p.updated_at || 'Unknown'}<br />Source: {p.source}</> : <>Status: {p.status} · Provenance: {p.provenance} (not independently verified)</>}
                </div><button type="button" onClick={() => showFeature(feature)} disabled={!geoJsonPointToLeaflet(feature)}>Show on map</button></li>;
              })}</ul>
            </details>;
          })}
        </div>}
      </section>}
      {isAdmin && <WaterPointManager latitude={latitude} longitude={longitude} onChanged={() => { requestVersion.current++; setLoading(false); setResults(null); }} />}
      {/* Map Element */}
      <div className="map-container" ref={mapRef} />

      {isAdmin && <p style={{fontSize:'0.875rem', color:'#475569', marginTop:8}}>Nearby search: teal ring = verified water point; purple ring = report. Existing map pins remain visible according to the layer controls above.</p>}
      {/* Map Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '16px', background: 'white', padding: '12px 20px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.875rem', color: '#475569' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#0284C7', display: 'inline-block' }} />
          <span>Tank normal</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
          <span>Tank warning or low</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
          <span>Tank critical</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#E11D48', display: 'inline-block' }} />
          <span>Active Citizen Incident</span>
        </div>
      </div>
    </div>
  );
}

