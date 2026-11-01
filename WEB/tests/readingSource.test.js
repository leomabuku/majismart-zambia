import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReadings, createReadingSource, mergeReading, normalizeReading } from '../src/services/readingSource.js';

const row = (percent = 69, timestamp = '2026-11-01T07:00:00Z') => ({
  id: 'reading-1', tank_id: 'TANK_001', water_level_percent: percent,
  water_depth_cm: 3, status: 'NORMAL', created_at: timestamp
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('rejects invalid telemetry and keeps zero as a valid measured value', () => {
  assert.equal(normalizeReading(row(101)), null);
  assert.equal(normalizeReading(row(null)), null);
  assert.equal(normalizeReading(row(10, 'invalid')), null);
  assert.equal(normalizeReading(row(0)).water_level_percent, 0);
});

test('duplicate or delayed packets cannot replace the latest reading', () => {
  const current = mergeReading({}, row(69));
  assert.equal(mergeReading(current, row(69)), current);
  assert.equal(mergeReading(current, { ...row(20), id: 'different-row' }), current);
  assert.equal(mergeReading(current, row(20, '2026-11-01T06:59:59Z')), current);
  assert.equal(mergeReading(current, row(80, '2026-11-01T07:00:10Z')).TANK_001.water_level_percent, 80);
});

test('updates to the same stored reading can correct its values without changing created_at', () => {
  const current = mergeReading({}, row(69));
  assert.equal(mergeReading(current, row(70)).TANK_001.water_level_percent, 70);
});

test('maps measured values onto the correct tank; missing and stale readings stay offline', () => {
  const tanks = [{ id: 'tank-001', tank_id_code: 'TANK_001', current_water_percent: 99 },
    { id: 'tank-002', tank_id_code: 'TANK_002', current_water_percent: 99 }];
  const readings = mergeReading({}, row(0));
  const live = applyReadings(tanks, readings, Date.parse('2026-11-01T07:00:30Z'));
  assert.equal(live[0].current_water_percent, 0);
  assert.equal(live[0].device_status, 'ONLINE');
  assert.equal(live[1].current_water_percent, null);
  assert.equal(live[1].telemetry_missing, true);
  assert.equal(applyReadings(tanks, readings, Date.parse('2026-11-01T07:01:01Z'))[0].device_status, 'OFFLINE');
});

function fakeClient() {
  const handlers = [];
  const queries = [];
  let status;
  let result = { data: [row()], error: null };
  let removed = 0;
  const client = {
    from(table) {
      const query = { table };
      queries.push(query);
      const builder = {
        select() { return builder; },
        eq(column, value) { query[column] = value; return builder; },
        order() { return builder; },
        limit(value) { query.limit = value; return Promise.resolve(result); }
      };
      return builder;
    },
    channel() {
      const channel = {
        on(type, filter, callback) { handlers.push({ filter, callback }); return channel; },
        subscribe(callback) { status = callback; return channel; }
      };
      return channel;
    },
    removeChannel() { removed++; return Promise.resolve(); }
  };
  return { client, handlers, queries, status: value => status(value),
    result: value => { result = value; }, removed: () => removed };
}

test('initial fetch, database events, reconnection catch-up and cleanup', async () => {
  const mock = fakeClient();
  const rows = [], states = [], errors = [];
  const source = createReadingSource(mock.client);
  const stop = source.watch(['TANK_001', 'TANK_002'], {
    onReading: value => rows.push(value), onStatus: value => states.push(value), onError: value => errors.push(value)
  });
  try {
    await flush();
    assert.equal(mock.queries.length, 2);
    assert.equal(mock.queries[1].tank_id, 'TANK_002');
    assert.equal(states.at(-1), false);
    mock.status('SUBSCRIBED');
    await flush();
    assert.equal(states.at(-1), true);
    const insert = mock.handlers.find(h => h.filter.event === 'INSERT');
    insert.callback({ new: row(75) });
    assert.equal(rows.at(-1).water_level_percent, 75);
    const before = rows.length;
    insert.callback({ new: { ...row(), tank_id: 'OTHER_TANK' } });
    assert.equal(rows.length, before);
    mock.status('CHANNEL_ERROR');
    assert.equal(states.at(-1), false);
    mock.result({ data: [row(90, '2026-11-01T07:00:20Z')], error: null });
    mock.status('SUBSCRIBED');
    await flush();
    assert.equal(rows.at(-1).water_level_percent, 90);
  } finally { stop(); }
  assert.equal(mock.removed(), 1);
  const before = rows.length;
  mock.handlers[0].callback({ new: row(95) });
  assert.equal(rows.length, before);
});

test('permission errors are visible and do not claim a connected source', async () => {
  const mock = fakeClient();
  mock.result({ data: null, error: { message: 'permission denied' } });
  const states = [], errors = [];
  const stop = createReadingSource(mock.client).watch(['TANK_001'], {
    onReading: () => assert.fail('must not fabricate a reading'),
    onStatus: state => states.push(state), onError: error => errors.push(error)
  });
  try {
    await flush();
    assert.equal(states.at(-1), false);
    assert.match(errors.at(-1), /permissions/);
  } finally { stop(); }
});

test('history is chronological and rejects malformed records', async () => {
  const mock = fakeClient();
  mock.result({ data: [row(80, '2026-11-01T07:01:00Z'), row(69), row(500)], error: null });
  const data = await createReadingSource(mock.client).history('TANK_001');
  assert.deepEqual(data.map(r => r.water_level_percent), [69, 80]);
});

test('polling recovers readings when no database events arrive', async () => {
  const mock = fakeClient();
  let resolveReading;
  const received = new Promise(resolve => { resolveReading = resolve; });
  const stop = createReadingSource(mock.client, { pollMs: 5 }).watch(['TANK_001'], {
    onReading: reading => { if (reading.water_level_percent === 88) resolveReading(); },
    onStatus: () => {}, onError: () => {}
  });
  let timeout;
  try {
    await flush();
    mock.result({ data: [row(88, '2026-11-01T07:00:30Z')], error: null });
    await Promise.race([received, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('polling did not recover')), 500);
    })]);
  } finally { stop(); clearTimeout(timeout); }
});
