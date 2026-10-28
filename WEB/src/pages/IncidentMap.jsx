import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Droplet, AlertTriangle, MapPin } from 'lucide-react';

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
          if (!station.latitude || !station.longitude) return;

          const primaryTank = station.tanks?.[0] || {};
          const percent = primaryTank.current_water_percent ?? 70;
          const status = primaryTank.current_status || 'NORMAL';

          const markerColor = (status === 'CRITICAL' || percent <= 15) ? '#EF4444' : 
                              (status === 'LOW' || percent <= 25) ? '#F59E0B' : '#0284C7';

          // Custom HTML SVG marker
          const icon = L.divIcon({
            className: 'custom-station-pin',
            html: `
              <div style="
                background: ${markerColor};
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 800;
                font-size: 11px;
                cursor: pointer;
              ">
                ${percent}%
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const marker = L.marker([station.latitude, station.longitude], { icon });
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px; line-height: 1.4;">
              <strong style="color: #03045E; font-size: 14px;">${station.name}</strong><br>
              <span style="color: #64748B;">Code: ${station.code} • ${station.community}</span>
              <hr style="margin: 6px 0; border: none; border-top: 1px solid #E2E8F0;">
              <div>Primary Tank: <strong>${primaryTank.tank_id_code || 'TANK_001'}</strong></div>
              <div>Water Level: <strong style="color: ${markerColor};">${percent}% (${primaryTank.current_water_depth_cm || 0} cm)</strong></div>
              <div>Status: <strong>${status}</strong></div>
              <div style="font-size: 11px; color: #94A3B8; margin-top: 4px;">Hardware: ${primaryTank.device_id_code || 'ESP32_001'}</div>
            </div>
          `);
          marker.addTo(layer);
        });
      }

      // 2. Add Community Report Incident Markers
      if (showReports && reports) {
        reports.forEach(rep => {
          if (!rep.latitude || !rep.longitude) return;

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

          const marker = L.marker([rep.latitude, rep.longitude], { icon });
          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px;">
              <strong style="color: #991B1B;">${rep.title}</strong><br>
              <span style="color: #64748B;">${rep.category.replace('_', ' ')} • ${rep.location_name}</span>
              <p style="margin: 6px 0; font-size: 12px; color: #334155;">${rep.description}</p>
              <div style="margin-top: 4px;">Status: <strong>${rep.status}</strong></div>
            </div>
          `);
          marker.addTo(layer);
        });
      }
    }
  }, [stations, reports, showStations, showReports]);

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
            <span style={{ fontWeight: 600, color: '#0284C7' }}>Water Tanks ({stations?.length || 0})</span>
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
          <span>Tank Normal (&gt; 25%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
          <span>Tank Low (15% - 25%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
          <span>Tank Critical (&le; 15%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#E11D48', display: 'inline-block' }} />
          <span>Active Citizen Incident</span>
        </div>
      </div>
    </div>
  );
}
