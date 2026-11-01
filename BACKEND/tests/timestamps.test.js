import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStoredTimestamp } from '../src/lib/timestamps.js';

test('SQL UTC and ISO timestamps represent the same instant regardless of local timezone', () => {
  assert.equal(parseStoredTimestamp('2026-10-31 10:20:30'), parseStoredTimestamp('2026-10-31T10:20:30Z'));
  assert.equal(parseStoredTimestamp(new Date('2026-10-31T10:20:30Z')), parseStoredTimestamp('2026-10-31 10:20:30'));
  assert.ok(Number.isNaN(parseStoredTimestamp(null)));
});
