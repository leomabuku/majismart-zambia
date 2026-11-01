import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryChangeBridge } from '../src/services/telemetryChangeBridge.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
test('fallback checks default to one second and reject invalid intervals', () => {
  for (const value of [undefined, NaN, 10]) {
    const bridge = new TelemetryChangeBridge({ readState: async () => [], onChange: () => {}, pollMs: value });
    assert.equal(bridge.status().check_interval_ms, 1000);
  }
});
function setup(overrides = {}) {
  const handlers = [];
  let subscribe, removed = 0, notifications = 0, state = [{ id: 'tank-001', last_reading_at: 'initial' }];
  const channel = {
    on(type, filter, callback) { handlers.push({ filter, callback }); return channel; },
    subscribe(callback) { subscribe = callback; return channel; }
  };
  const client = { channel: () => channel, removeChannel: async () => { removed++; } };
  const bridge = new TelemetryChangeBridge({ client, readState: async () => state,
    onChange: () => notifications++, ...overrides });
  return { bridge, handlers, subscribe: value => subscribe(value), removed: () => removed,
    notifications: () => notifications, state: value => { state = value; } };
}

test('database event immediately invalidates the dashboard without waiting for polling', async () => {
  const mock = setup(); mock.bridge.start(); await flush();
  assert.equal(mock.notifications(), 0);
  assert.deepEqual(mock.handlers.map(h => h.filter.table), ['water_level_readings', 'tanks']);
  mock.handlers[0].callback({ new: { id: 'reading-1', secret: 'must-not-leave-server' } });
  assert.equal(mock.notifications(), 1);
  assert.ok(mock.bridge.status().last_event_at);
  await mock.bridge.stop();
  assert.equal(mock.removed(), 1);
  mock.handlers[0].callback({ new: {} });
  assert.equal(mock.notifications(), 1);
});

test('out-of-process tank changes invalidate clients even without Supabase Realtime credentials', async () => {
  const mock = setup({ client: null }); mock.bridge.start(); await flush();
  await mock.bridge.check(); assert.equal(mock.notifications(), 0);
  mock.state([{ id: 'tank-001', last_reading_at: 'new-reading' }]);
  await mock.bridge.check(); assert.equal(mock.notifications(), 1);
  await mock.bridge.check(); assert.equal(mock.notifications(), 1);
  assert.equal(mock.bridge.status().mode, 'database-fallback');
  await mock.bridge.stop();
});

test('reconnect catches up and channel errors retain fallback delivery', async () => {
  const mock = setup(); mock.bridge.start(); await flush();
  mock.subscribe('SUBSCRIBED'); assert.equal(mock.notifications(), 1);
  assert.equal(mock.bridge.status().mode, 'supabase-realtime-with-fallback');
  mock.subscribe('CHANNEL_ERROR'); assert.equal(mock.bridge.status().mode, 'database-fallback');
  mock.state([{ id: 'tank-001', last_reading_at: 'offline-write' }]);
  await mock.bridge.check(); assert.equal(mock.notifications(), 2);
  await mock.bridge.stop();
});

test('does not query without viewers, overlap checks, or publish late results after shutdown', async () => {
  let queries = 0, resolve, viewers = false;
  const mock = setup({ hasViewers: () => viewers, readState: () => {
    queries++; return new Promise(done => { resolve = done; });
  } });
  mock.bridge.start(); await flush(); assert.equal(queries, 0);
  viewers = true;
  const pending = mock.bridge.check(); await mock.bridge.check(); assert.equal(queries, 1);
  await mock.bridge.stop(); resolve([{ id: 'late' }]); await pending;
  assert.equal(mock.notifications(), 0);
});

test('database errors remain visible without stopping the stream and recover on the next check', async () => {
  let fails = true;
  const mock = setup({ readState: async () => { if (fails) throw Error('database unavailable'); return []; } });
  mock.bridge.start(); await flush(); assert.equal(mock.bridge.status().check_error, true);
  fails = false; await mock.bridge.check(); assert.equal(mock.bridge.status().check_error, false);
  await mock.bridge.stop();
});
