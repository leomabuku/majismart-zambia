import test from 'node:test';
import assert from 'node:assert/strict';
import { reportAnalyticsCsv } from '../src/services/reportAnalyticsCsv.js';

test('exports aggregate values and neutralizes location formula injection', () => {
  const csv = reportAnalyticsCsv({
    filters: { start: '2026-10-01', end: '2026-11-01', timezone: 'Africa/Lusaka', category: 'ALL' },
    generated_at: '2026-11-01T07:00:00Z', total: 2, open: 2, resolved: 0, rejected: 0,
    resolution_rate_percent: 0, average_resolution_hours: null, resolution_sample_size: 0,
    statuses: [], categories: [], daily_submissions: [], open_age: { over_48h: 2 },
    locations: [{ location: '=HYPERLINK("https://example.com")', total: 1, open: 1 },
      { location: 'Community, "A"\nArea', total: 1, open: 1 }]
  });
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example.com""\)"/);
  assert.ok(csv.includes('"Community, ""A""\nArea"'));
  assert.ok(csv.includes('"Average hours to latest resolution",""'));
  assert.ok(csv.includes('"Resolved share of all selected reports (%)","0"'));
});
