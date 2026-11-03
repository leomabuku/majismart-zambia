// Small geolocation helpers shared by the map and report views.

export function hasPin(entity) {
  if (entity?.latitude == null || entity?.longitude == null || entity.latitude === '' || entity.longitude === '') return false;
  const lat = Number(entity.latitude);
  const lng = Number(entity.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export function formatCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return '—';
  return `${la.toFixed(6)}, ${ln.toFixed(6)}`;
}

/** Human readable accuracy, e.g. "±8 m" or "±1.2 km". */
export function formatAccuracy(meters) {
  if (meters == null || meters === '') return null;
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return `±${Math.round(value)} m`;
  return `±${(value / 1000).toFixed(1)} km`;
}

/**
 * Turn-by-turn directions in whichever map app the phone/browser has.
 * Google Maps universal link: works in the Android app, iOS app and the web.
 */
export function directionsUrl(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving`;
}

/** A single dropped pin, useful when the user just wants to see the spot. */
export function pinUrl(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return `https://www.google.com/maps/search/?api=1&query=${la},${ln}`;
}

/** Escape untrusted text before it goes into Leaflet popup HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// GeoJSON uses longitude, latitude; Leaflet uses latitude, longitude.
export function geoJsonPointToLeaflet(feature) {
  const c = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
  if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number' || !hasPin({latitude:c[1], longitude:c[0]})) return null;
  return [c[1], c[0]];
}
