import test from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { shutdownServer } from '../src/server.js';

const BASE_URL = 'http://localhost:5000';
const API_KEY = process.env.IOT_API_KEY || 'majismart_iot_esp32_device_secret_2026';

async function loginAsAdmin() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@majismart.zm',
      password: 'AdminPassword2026!'
    })
  });
  const data = await response.json();
  assert.ok(data.token, 'Admin token should be issued');
  return data.token;
}

function deviceRequest(payload, apiKey = API_KEY) {
  return fetch(`${BASE_URL}/api/iot/readings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });
}

after(async () => {
  await shutdownServer();
});

test('system health check', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ONLINE');
});

test('ingests the hardware telemetry contract', async () => {
  const response = await deviceRequest({
    device_id: 'ESP32_001',
    tank_id: 'TANK_001',
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 69,
    status: 'NORMAL'
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.water_level_percent, 69);
  assert.equal(body.data.status, 'NORMAL');
});

test('rejects invalid telemetry input', async () => {
  const invalidPercent = await deviceRequest({
    device_id: 'ESP32_001',
    tank_id: 'TANK_001',
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 140,
    status: 'NORMAL'
  });
  assert.equal(invalidPercent.status, 400);

  const missingDevice = await deviceRequest({
    tank_id: 'TANK_001',
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 50,
    status: 'NORMAL'
  });
  assert.equal(missingDevice.status, 400);
});

test('critical readings trigger alerts', async () => {
  const response = await deviceRequest({
    device_id: 'ESP32_001',
    tank_id: 'TANK_001',
    distance_cm: 45,
    water_depth_cm: 5,
    water_level_percent: 10,
    status: 'CRITICAL'
  });
  assert.equal(response.status, 201);

  const alerts = await fetch(`${BASE_URL}/api/alerts?status=ACTIVE`);
  const data = await alerts.json();
  assert.ok(data.data.some((alert) => alert.tank_id_code === 'TANK_001' && alert.severity === 'CRITICAL'));
});

test('admin can resolve a community report', async () => {
  const token = await loginAsAdmin();
  const reportResponse = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'WATER_SHORTAGE',
      title: 'Severe drought shortage',
      description: 'No piped water for 48 hours.',
      location_name: 'Chilenje Zone 3'
    })
  });
  assert.equal(reportResponse.status, 201);
  const report = await reportResponse.json();

  const updateResponse = await fetch(`${BASE_URL}/api/reports/${report.data.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'RESOLVED', admin_notes: 'Supply restored.' })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).data.status, 'RESOLVED');
});

test('rejects an invalid device key', async () => {
  const response = await deviceRequest({
    device_id: 'ESP32_UNKNOWN_01',
    tank_id: 'TANK_001',
    distance_cm: 15.5,
    water_depth_cm: 34.5,
    water_level_percent: 69,
    status: 'NORMAL'
  }, 'invalid-key');
  assert.equal(response.status, 401);
});

test('hides rejected reports from unauthenticated users', async () => {
  const token = await loginAsAdmin();
  const createResponse = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: 'OTHER',
      title: 'Privacy check report',
      description: 'Automated visibility test.',
      location_name: 'Lusaka Test Area'
    })
  });
  const created = await createResponse.json();

  const rejectResponse = await fetch(`${BASE_URL}/api/reports/${created.data.id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status: 'REJECTED', rejection_reason: 'Automated test rejection.' })
  });
  assert.equal(rejectResponse.status, 200);

  const unauthenticatedResponse = await fetch(`${BASE_URL}/api/reports/${created.data.id}`);
  assert.equal(unauthenticatedResponse.status, 404);
});
