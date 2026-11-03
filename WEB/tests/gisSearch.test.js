import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyQueryStrings } from '../src/utils/gisSearch.js';

test('status filter applies only to water points and preserves the requested coordinates', () => {
  const result = nearbyQueryStrings({ latitude:'-15.4', longitude:'28.3', radius:'5000', operationalStatus:'OPERATIONAL' });
  const water = new URLSearchParams(result.water), reports = new URLSearchParams(result.reports);
  assert.equal(water.get('operationalStatus'), 'OPERATIONAL');
  assert.equal(reports.has('operationalStatus'), false);
  assert.equal(reports.get('latitude'), '-15.4');
  assert.equal(reports.get('longitude'), '28.3');
  assert.equal(water.get('radiusMeters'), '5000');
});
test('all-status searches do not send an operational status filter', () => {
  const result = nearbyQueryStrings({ latitude:'-15.4', longitude:'28.3', radius:'1000', operationalStatus:'ALL' });
  assert.equal(new URLSearchParams(result.water).has('operationalStatus'), false);
  assert.equal(result.water, result.reports);
});
