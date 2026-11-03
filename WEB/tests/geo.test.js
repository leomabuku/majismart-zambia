import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hasPin, escapeHtml, formatAccuracy } from '../src/utils/geo.js';

test('only valid recorded coordinate pairs produce pins', () => {
  assert.equal(hasPin({latitude:null,longitude:28}),false);
  assert.equal(hasPin({latitude:'',longitude:28}),false);
  assert.equal(hasPin({latitude:91,longitude:28}),false);
  assert.equal(hasPin({latitude:0,longitude:0}),false);
  assert.equal(hasPin({latitude:-15.4,longitude:28.3}),true);
});
test('popup escaping prevents markup injection', () => {
  assert.equal(escapeHtml('" onerror="x'), '&quot; onerror=&quot;x');
});

test('missing accuracy is not presented as zero metres', () => { assert.equal(formatAccuracy(null), null); });

import { geoJsonPointToLeaflet } from '../src/utils/geo.js';
test('GeoJSON point conversion uses longitude first and rejects missing or invalid geometry', () => {
  assert.deepEqual(geoJsonPointToLeaflet({geometry:{type:'Point',coordinates:[28.3,-15.4]}}), [-15.4,28.3]);
  assert.equal(geoJsonPointToLeaflet({geometry:{type:'Point',coordinates:[0,0]}}), null);
  assert.equal(geoJsonPointToLeaflet({geometry:{type:'Point',coordinates:[181,0]}}), null);
  assert.equal(geoJsonPointToLeaflet({geometry:{type:'Polygon',coordinates:[]}}), null);
  assert.equal(geoJsonPointToLeaflet(null), null);
});
