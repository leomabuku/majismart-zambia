export const REPORT_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
export const REPORT_CATEGORIES = ['WATER_SHORTAGE', 'PIPE_LEAKAGE', 'BURST_PIPE', 'TANK_MALFUNCTION', 'WATER_QUALITY', 'OTHER'];
const DAY = 86400000;
const lusakaDay = value => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lusaka', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(value));

export function timestamp(value) {
  if (!value) return NaN;
  // SQLite's datetime('now') is UTC but has no offset. PostgreSQL returns Date/ISO values.
  return Date.parse(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z' : value);
}

export function analyticsFilters(query, now = Date.now()) {
  const end = query.end || lusakaDay(now);
  const start = query.start || lusakaDay(now - 29 * DAY);
  for (const date of [start, end]) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error('Use valid start and end dates in YYYY-MM-DD format.');
    }
  }
  const since = Date.parse(`${start}T00:00:00+02:00`);
  const until = Date.parse(`${end}T00:00:00+02:00`) + DAY;
  if (until <= since || until - since > 366 * DAY) throw new Error('Choose a date range between 1 and 366 days.');
  const category = query.category || 'ALL';
  if (category !== 'ALL' && !REPORT_CATEGORIES.includes(category)) throw new Error('Invalid report category.');
  return { start, end, category, since, until, timezone: 'Africa/Lusaka' };
}

export function summarizeReports(rows, filters, now = Date.now()) {
  const statusCounts = Object.fromEntries(REPORT_STATUSES.map(s => [s, 0]));
  const categories = Object.fromEntries(REPORT_CATEGORIES.map(c => [c, 0]));
  const days = new Map();
  const locations = new Map();
  const ages = { under_24h: 0, from_24_to_48h: 0, over_48h: 0 };
  let open = 0, resolutionHours = 0, resolutionSample = 0, invalidDates = 0;
  for (let day = filters.since; day < filters.until; day += DAY) days.set(lusakaDay(day), 0);
  let total = 0;
  for (const row of rows) {
    const created = timestamp(row.created_at);
    if (!Number.isFinite(created) || created > now) { invalidDates++; continue; }
    if (created < filters.since || created >= filters.until ||
        (filters.category !== 'ALL' && row.category !== filters.category)) continue;
    total++;
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    categories[row.category] = (categories[row.category] || 0) + 1;
    const day = lusakaDay(created);
    days.set(day, (days.get(day) || 0) + 1);
    const location = row.station_name || row.location_name || 'Unspecified';
    const group = locations.get(location) || { location, total: 0, open: 0 };
    group.total++;
    const isOpen = ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(row.status);
    if (isOpen) {
      open++; group.open++;
      const age = (now - created) / 3600000;
      ages[age < 24 ? 'under_24h' : age <= 48 ? 'from_24_to_48h' : 'over_48h']++;
    }
    locations.set(location, group);
    const resolved = timestamp(row.resolved_at);
    if (row.status === 'RESOLVED' && resolved >= created && resolved <= now) {
      resolutionHours += (resolved - created) / 3600000;
      resolutionSample++;
    }
  }
  return {
    filters: { start: filters.start, end: filters.end, category: filters.category, timezone: filters.timezone },
    generated_at: new Date(now).toISOString(),
    total, open, resolved: statusCounts.RESOLVED, rejected: statusCounts.REJECTED,
    resolution_rate_percent: total ? Math.round(statusCounts.RESOLVED / total * 1000) / 10 : null,
    average_resolution_hours: resolutionSample ? Math.round(resolutionHours / resolutionSample * 10) / 10 : null,
    resolution_sample_size: resolutionSample,
    excluded_invalid_dates: invalidDates,
    statuses: Object.entries(statusCounts).map(([label, count]) => ({ label, count })),
    categories: Object.entries(categories).map(([label, count]) => ({ label, count })),
    daily_submissions: [...days].map(([date, count]) => ({ date, count })),
    open_age: ages,
    locations: [...locations.values()].sort((a, b) => b.open - a.open || b.total - a.total || a.location.localeCompare(b.location)).slice(0, 10)
  };
}
