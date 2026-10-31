import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Droplet, AlertTriangle, MapPin } from 'lucide-react';
import { escapeHtml, directionsUrl, formatAccuracy, formatCoords, hasPin } from '../utils/geo';

export default function IncidentMap({ stations, tanks, reports }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);

  const [showStations, setShowStations] = useState(true);
  const [showReports, setShowReports] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

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
        const status = tank.device_status === 'OFFLINE' ? 'OFFLINE' : (tank.current_condition || tank.current_status || 'UNKNOWN');
        const marker = L.circleMarker([Number(tank.latitude), Number(tank.longitude)], {radius: 9, color: status === 'CRITICAL' ? '#dc2626' : status === 'LOW' || status === 'WARNING' ? '#d97706' : status === 'OFFLINE' ? '#64748b' : '#0284c7'});
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', color: '#03045E' }}>Geographic Infrastructure & Incidents</h2>
          <p style={{ fontSize: '13px', color: '#64748B' }}>Spatial distribution of storage reservoirs, water towers, and citizen alerts</p>
        </div>

        {/* Map Layers Filter */}
        <div style={{ display: 'flex', gap: '12px', background: 'white', padding: '6px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showStations} 
              onChange={e => setShowStations(e.target.checked)} 
            />
            <span style={{ fontWeight: 600, color: '#0284C7' }}>Stations & Tanks ({stations?.length || 0} / {tanks?.length || 0})</span>
          </label>

          <span style={{ color: '#CBD5E1' }}>|</span>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showReports} 
              onChange={e => setShowReports(e.target.checked)} 
            />
            <span style={{ fontWeight: 600, color: '#E11D48' }}>Community Incidents ({reports?.length || 0})</span>
          </label>
        </div>
      </div>

      {/* Map Element */}
      <div className="map-container" ref={mapRef} />

      {/* Map Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '16px', background: 'white', padding: '12px 20px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px', color: '#475569' }}>
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
