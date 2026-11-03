// Water-point status filters apply to that layer only, never to nearby reports.
export function nearbyQueryStrings({ latitude, longitude, radius, operationalStatus }) {
  const reports = new URLSearchParams({ latitude, longitude, radiusMeters: radius });
  const water = new URLSearchParams(reports);
  if (operationalStatus && operationalStatus !== 'ALL') water.set('operationalStatus', operationalStatus);
  return { water: water.toString(), reports: reports.toString() };
}
