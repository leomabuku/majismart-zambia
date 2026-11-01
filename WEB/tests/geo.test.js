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
