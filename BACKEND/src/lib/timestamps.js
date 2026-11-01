// SQLite's datetime('now') is UTC but lacks a timezone suffix. PostgreSQL
// timestamps returned by pg are Date instances; ISO strings retain their zone.
export function parseStoredTimestamp(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return NaN;
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value);
  return Date.parse(sqliteUtc ? `${value.replace(' ', 'T')}Z` : value);
}
