import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsFilters, summarizeReports } from '../src/services/reportAnalytics.js';

const now = Date.parse('2026-11-01T10:00:00Z');
const filters = analyticsFilters({ start: '2026-10-01', end: '2026-11-01' }, now);
const report = (status, created_at, extra = {}) => ({ status, created_at, category: 'PIPE_LEAKAGE', location_name: 'Test community', ...extra });

test('validates real calendar dates, range limits, categories and query types', () => {
  for (const query of [
    { start: '2026-02-30' }, { start: '2026-11-02', end: '2026-11-01' },
    { start: '2024-01-01' }, { category: 'UNKNOWN' }, { start: ['2026-10-01'] }
  ]) assert.throws(() => analyticsFilters(query, now));
  assert.equal(analyticsFilters({}, now).start, '2026-10-03');
});

test('uses Zambia day boundaries and includes the whole end date', () => {
  const oneDay = analyticsFilters({ start: '2026-10-31', end: '2026-10-31' }, now);
  const result = summarizeReports([
    report('SUBMITTED', '2026-10-30T21:59:59Z'),
    report('SUBMITTED', '2026-10-30T22:00:00Z'),
    report('SUBMITTED', '2026-10-31T21:59:59Z'),
    report('SUBMITTED', '2026-10-31T22:00:00Z')
  ], oneDay, now);
  assert.equal(result.total, 2);
  assert.deepEqual(result.daily_submissions, [{ date: '2026-10-31', count: 2 }]);
});

test('counts all workflow states and uses history only for valid current resolutions', () => {
  const result = summarizeReports([
    report('SUBMITTED', '2026-10-29T07:00:00Z'),
    report('ACKNOWLEDGED', '2026-10-31T07:00:00Z'),
    report('IN_PROGRESS', '2026-11-01T07:00:00Z'),
    report('RESOLVED', '2026-10-28T07:00:00Z', { resolved_at: '2026-10-29T07:00:00Z' }),
    report('RESOLVED', '2026-10-28T07:00:00Z'),
    report('REJECTED', '2026-10-28T07:00:00Z'),
    // A previously resolved report that reopened must not enter the resolution average.
    report('IN_PROGRESS', '2026-10-28T07:00:00Z', { resolved_at: '2026-10-30T07:00:00Z' })
  ], filters, now);
  assert.equal(result.total, 7);
  assert.equal(result.open, 4);
  assert.equal(result.resolved, 2);
  assert.equal(result.rejected, 1);
  assert.equal(result.resolution_rate_percent, 28.6);
  assert.equal(result.average_resolution_hours, 24);
  assert.equal(result.resolution_sample_size, 1);
  assert.deepEqual(result.open_age, { under_24h: 1, from_24_to_48h: 1, over_48h: 2 });
  assert.equal(result.locations[0].open, 4);
  assert.equal(result.daily_submissions.reduce((sum, d) => sum + d.count, 0), 7);
});

test('filters category, zero-fills days and returns unavailable rates for empty data', () => {
  const scoped = analyticsFilters({ start: '2026-10-31', end: '2026-11-01', category: 'OTHER' }, now);
  const result = summarizeReports([report('SUBMITTED', '2026-10-31T09:00:00Z')], scoped, now);
  assert.equal(result.total, 0);
  assert.equal(result.resolution_rate_percent, null);
  assert.equal(result.average_resolution_hours, null);
  assert.equal(result.daily_submissions.length, 2);
  assert.ok(result.daily_submissions.every(d => d.count === 0));
});

test('SQLite UTC timestamps are not interpreted in the server local timezone', () => {
  const result = summarizeReports([report('RESOLVED', '2026-10-31 23:00:00', { resolved_at: '2026-11-01 01:00:00' })], filters, now);
  assert.equal(result.average_resolution_hours, 2);
  assert.equal(result.daily_submissions.at(-1).count, 1);
});

test('invalid and future timestamps do not fabricate report counts or resolution durations', () => {
  const result = summarizeReports([
    report('SUBMITTED', 'bad date'), report('SUBMITTED', '2026-11-01T11:00:00Z'),
    report('RESOLVED', '2026-10-31T07:00:00Z', { resolved_at: '2026-10-30T07:00:00Z' })
  ], filters, now);
  assert.equal(result.total, 1);
  assert.equal(result.excluded_invalid_dates, 2);
  assert.equal(result.average_resolution_hours, null);
});
