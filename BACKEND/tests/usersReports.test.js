import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { shutdownServer } from '../src/server.js';

const BASE_URL = 'http://localhost:5000';
const ADMIN_EMAIL = 'admin@majismart.zm';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword2026!';
const CUSTOMER_EMAIL = 'mwape@community.zm';
const CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || 'CustomerPass2026!';

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

function authed(token, extra = {}) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra };
}

after(async () => {
  await shutdownServer();
});

// ---------------------------------------------------------------------------
// Admin-only user directory and role management
// ---------------------------------------------------------------------------

test('customers cannot list users or change roles', async () => {
  const { token } = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

  const list = await fetch(`${BASE_URL}/api/users`, { headers: authed(token) });
  assert.equal(list.status, 403);

  const patch = await fetch(`${BASE_URL}/api/users/usr-admin-01/role`, {
    method: 'PATCH',
    headers: authed(token),
    body: JSON.stringify({ role: 'customer' })
  });
  assert.equal(patch.status, 403);
});

test('anonymous callers cannot list users', async () => {
  const res = await fetch(`${BASE_URL}/api/users`);
  assert.equal(res.status, 401);
});

test('admin sees every account with its role and report count', async () => {
  const { token } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await fetch(`${BASE_URL}/api/users`, { headers: authed(token) });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length >= 3);

  const admin = body.data.find((u) => u.email === ADMIN_EMAIL);
  assert.equal(admin.role, 'admin');
  assert.equal(typeof admin.report_count, 'number');
  assert.equal(admin.is_self, true);

  // Passwords are never part of the directory payload.
  assert.ok(body.data.every((u) => u.password_hash === undefined));
});

test('admin can promote a customer and demote them again', async () => {
  const { token } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const list = await (await fetch(`${BASE_URL}/api/users`, { headers: authed(token) })).json();
  const customer = list.data.find((u) => u.email === CUSTOMER_EMAIL);
  assert.equal(customer.role, 'customer');

  const promote = await fetch(`${BASE_URL}/api/users/${customer.id}/role`, {
    method: 'PATCH',
    headers: authed(token),
    body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).data.role, 'admin');

  const demote = await fetch(`${BASE_URL}/api/users/${customer.id}/role`, {
    method: 'PATCH',
    headers: authed(token),
    body: JSON.stringify({ role: 'customer' })
  });
  assert.equal(demote.status, 200);
  assert.equal((await demote.json()).data.role, 'customer');
});

test('role changes reject unknown roles and unknown users', async () => {
  const { token } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const badRole = await fetch(`${BASE_URL}/api/users/usr-cust-01/role`, {
    method: 'PATCH',
    headers: authed(token),
    body: JSON.stringify({ role: 'superuser' })
  });
  assert.equal(badRole.status, 400);

  const missing = await fetch(`${BASE_URL}/api/users/does-not-exist/role`, {
    method: 'PATCH',
    headers: authed(token),
    body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(missing.status, 404);
});

// ---------------------------------------------------------------------------
// Reports carry the device location and photo evidence
// ---------------------------------------------------------------------------

test('a customer report stores the GPS fix, accuracy and photo', async () => {
  const { token } = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);

  // 1x1 transparent PNG.
  const photo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const res = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: authed(token),
    body: JSON.stringify({
      category: 'BURST_PIPE',
      title: 'Burst pipe on Chilenje road',
      description: 'Water gushing across the road since morning.',
      location_name: 'Chilenje South Market',
      latitude: -15.4412,
      longitude: 28.3245,
      location_accuracy_m: 8.4,
      location_source: 'GPS',
      photo_base64: photo,
      photo_mime: 'image/png'
    })
  });

  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(Number(data.latitude).toFixed(4), '-15.4412');
  assert.equal(Number(data.longitude).toFixed(4), '28.3245');
  assert.equal(Number(data.location_accuracy_m), 8.4);
  assert.equal(data.location_source, 'GPS');
  assert.ok(data.image_url.startsWith('data:image/png;base64,'), 'photo is stored as a data URL');
  assert.equal(data.reporter_id, 'usr-cust-01');
});

test('a report without a location is recorded as MANUAL and not pinned at 0,0', async () => {
  const res = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'WATER_SHORTAGE',
      title: 'No pressure in Matero',
      description: 'Two days without water.',
      location_name: 'Matero',
      latitude: null,
      longitude: null
    })
  });

  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.equal(data.latitude, null);
  assert.equal(data.longitude, null);
  assert.equal(data.location_source, 'MANUAL');
});

test('oversized or unsupported photos are rejected', async () => {
  const res = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'PIPE_LEAKAGE',
      title: 'Leak',
      description: 'Leak near the school.',
      location_name: 'Kabwata',
      photo_base64: 'A'.repeat(200),
      photo_mime: 'application/pdf'
    })
  });
  assert.equal(res.status, 400);
});
