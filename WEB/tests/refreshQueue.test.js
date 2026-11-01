import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshQueue } from '../src/services/refreshQueue.js';

test('reading events refresh immediately, serializing a burst into one catch-up read', async () => {
  const releases = [];
  let calls = 0, active = 0, maxActive = 0;
  const queue = createRefreshQueue(async () => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => releases.push(resolve)); active--;
  });
  const done = queue.request();
  assert.equal(calls, 1);
  queue.request(); queue.request(); queue.request();
  releases.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); assert.equal(maxActive, 1);
  releases.shift()(); await done;
  assert.equal(calls, 2); queue.close();
});

test('failed reads recover and closing cancels queued reads', async () => {
  let calls = 0, errors = 0;
  const queue = createRefreshQueue(async () => { calls++; if (calls === 1) throw Error('offline'); }, () => errors++);
  await queue.request(); await queue.request();
  assert.equal(calls, 2); assert.equal(errors, 1);
  queue.close(); await queue.request(); assert.equal(calls, 2);
});
