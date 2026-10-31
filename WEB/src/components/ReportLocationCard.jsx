import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Crosshair, Camera, ImageOff } from 'lucide-react';
import { hasPin, formatCoords, formatAccuracy, directionsUrl, pinUrl } from '../utils/geo';

/**
 * Where a community report happened: a single-pin mini map, the raw GPS fix
 * quality, one-tap directions for a dispatch crew, and the photo evidence the
 * resident captured in the app.
 */
export default function ReportLocationCard({ report }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const pinned = hasPin(report);

  useEffect(() => {
    if (!pinned || !mapRef.current) return undefined;

    if (!mapInstance.current) {
      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false
      }).setView([Number(report.latitude), Number(report.longitude)], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      L.marker([Number(report.latitude), Number(report.longitude)], {
        icon: L.divIcon({
          className: 'report-pin',
          html: `<div style="background:#E11D48;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(map);

      mapInstance.current = map;
    } else {
      mapInstance.current.setView([Number(report.latitude), Number(report.longitude)], 16);
    }

    // Leaflet needs a nudge when it is created inside a modal.
    setTimeout(() => mapInstance.current?.invalidateSize(), 80);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [pinned, report.id, report.latitude, report.longitude]);

  const accuracy = formatAccuracy(report.location_accuracy_m);
  const photo = report.image_url;

  return (
    <div className="report-location-card">
      {pinned ? (
        <>
          <div className="report-mini-map" ref={mapRef} />
          <div className="report-location-meta">
            <div className="report-location-row">
              <Crosshair size={13} />
              <span>{formatCoords(report.latitude, report.longitude)}</span>
              {accuracy && <span className="accuracy-chip">{accuracy}</span>}
              {report.location_source && (
                <span className="source-chip">{report.location_source}</span>
              )}
            </div>
            <div className="report-location-actions">
              <a
                className="btn-primary report-directions"
                href={directionsUrl(report.latitude, report.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={14} /> Directions
              </a>
              <a
                className="btn-secondary"
                href={pinUrl(report.latitude, report.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={14} /> Open pin
              </a>
            </div>
          </div>
        </>
      ) : (
        <div className="report-no-pin">
          <MapPin size={16} />
          <span>
            No GPS fix was captured with this report. The street name below is the
            only location on file.
          </span>
        </div>
      )}

      <div className="report-photo-block">
        <div className="report-photo-label">
          <Camera size={13} /> Photo evidence
        </div>
        {photo ? (
          <a href={photo} target="_blank" rel="noreferrer" className="report-photo">
            <img src={photo} alt={`Report evidence for ${report.title}`} />
          </a>
        ) : (
          <div className="report-photo-empty">
            <ImageOff size={16} /> No photo attached
          </div>
        )}
      </div>
    </div>
  );
}
