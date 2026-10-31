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

test('report analytics is admin-only, excludes seed reports and validates dates', async () => {
  const customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal((await fetch(`${BASE_URL}/api/analytics/reports`, { headers: authed(customer.token) })).status, 403);
  assert.equal((await fetch(`${BASE_URL}/api/analytics/reports?from=2026-02-30`, { headers: authed(admin.token) })).status, 400);
  const res = await fetch(`${BASE_URL}/api/analytics/reports?from=2100-01-01`, { headers: authed(admin.token) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.total, 0);
  assert.equal(body.data.resolution.rate_percent, null);
  assert.equal(body.data.resolution.mean_hours, null);
});

test('analytics counts reports once, excludes rejected from resolution rate and uses recorded resolution history', async () => {
  const customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const location = `Analytics test ${Date.now()}`;
  const create = async category => {
    const response = await fetch(`${BASE_URL}/api/reports`, { method: 'POST', headers: authed(customer.token), body: JSON.stringify({ category, title: 'Test report', description: 'Test', location_name: location }) });
    assert.equal(response.status, 201);
    return (await response.json()).data.id;
  };
  const first = await create('WATER_SHORTAGE');
  const second = await create('PIPE_LEAKAGE');
  for (const [id, status] of [[first, 'IN_PROGRESS'], [first, 'RESOLVED'], [second, 'REJECTED']]) {
    const response = await fetch(`${BASE_URL}/api/reports/${id}/status`, { method: 'PUT', headers: authed(admin.token), body: JSON.stringify({ status, admin_notes: 'Internal only' }) });
    assert.equal(response.status, 200);
  }
  const res = await fetch(`${BASE_URL}/api/analytics/reports?location=${encodeURIComponent(location)}`, { headers: authed(admin.token) });
  const data = (await res.json()).data;
  assert.equal(data.total, 2);
  assert.equal(data.resolution.eligible, 1);
  assert.equal(data.resolution.rate_percent, 100);
  assert.equal(data.resolution.observations, 1);
  assert.equal(data.categories.length, 2);
  const ownerView = await (await fetch(`${BASE_URL}/api/reports/${first}`, { headers: authed(customer.token) })).json();
  assert.equal(ownerView.data.admin_notes, null);
  assert.ok(ownerView.data.history.every(event => !('notes' in event)));
});

test('case events are admin-only and preserve original customer category', async () => {
  const customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const created = await (await fetch(`${BASE_URL}/api/reports`,{method:'POST',headers:authed(customer.token),body:JSON.stringify({category:'WATER_SHORTAGE',title:'Case test',description:'No water',location_name:'Test'})})).json();
  const path = `${BASE_URL}/api/reports/${created.data.id}/case`;
  assert.equal((await fetch(path,{headers:authed(customer.token)})).status,403);
  assert.equal((await fetch(path,{method:'POST',headers:authed(admin.token),body:JSON.stringify({confirmed_category:'DAMAGED_VALVE',severity:'HIGH',findings:'Valve damaged',action_taken:'REPAIR',outcome:'RESOLVED'})})).status,201);
  const events = await (await fetch(path,{headers:authed(admin.token)})).json();
  assert.equal(events.data[0].confirmed_category,'DAMAGED_VALVE');
  const report = await (await fetch(`${BASE_URL}/api/reports/${created.data.id}`,{headers:authed(customer.token)})).json();
  assert.equal(report.data.category,'WATER_SHORTAGE');
  assert.equal(report.data.findings,undefined);
});

test('administrative analytics use the latest case classification without multiplying reports', async () => {
  const customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const location = `Case aggregate ${Date.now()}`;
  const report = await (await fetch(`${BASE_URL}/api/reports`,{method:'POST',headers:authed(customer.token),body:JSON.stringify({category:'WATER_SHORTAGE',title:'Analysis',description:'Issue',location_name:location})})).json();
  const caseUrl=`${BASE_URL}/api/reports/${report.data.id}/case`;
  for(const event of [{confirmed_category:'DAMAGED_VALVE',severity:'HIGH'},{confirmed_category:'BURST_PIPE',outcome:'PENDING'}]) {
    assert.equal((await fetch(caseUrl,{method:'POST',headers:authed(admin.token),body:JSON.stringify(event)})).status,201);
    await new Promise(resolve => setTimeout(resolve, 1100)); // SQLite case events currently use second precision
  }
  const result=await (await fetch(`${BASE_URL}/api/analytics/reports?location=${encodeURIComponent(location)}`,{headers:authed(admin.token)})).json();
  assert.equal(result.data.total,1);
  assert.equal(result.data.categories[0].label,'WATER_SHORTAGE');
  assert.equal(result.data.classifications[0].label,'BURST_PIPE');
  assert.equal(result.data.severities[0].label,'HIGH');
  assert.equal(result.data.outcomes[0].label,'PENDING');
});

test('structured customer submission preserves reported details separately from legacy category and case findings', async () => {
  const { token } = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const base = {category:'LOW_PRESSURE',title:'Low pressure',description:'Only a trickle at the tap',location_name:'Test neighbourhood',reported_severity:'HIGH',ongoing:'YES',affected_area:'Two streets',observed_at:'2025-01-02T08:00:00Z'};
  const send = body => fetch(`${BASE_URL}/api/reports`,{method:'POST',headers:authed(token),body:JSON.stringify(body)});
  assert.equal((await send({...base,reported_severity:'SEVERE'})).status,400);
  assert.equal((await send({...base,observed_at:'9999-01-02T08:00:00Z'})).status,400);
  const response=await send(base); assert.equal(response.status,201);
  const created=(await response.json()).data;
  assert.equal(created.category,'OTHER'); assert.equal(created.reported_category,'LOW_PRESSURE');
  assert.equal(created.reported_severity,'HIGH'); assert.equal(created.ongoing,'YES');
  const {db}=await import('../src/database/db.js');
  assert.equal((await db.prepare('SELECT provenance FROM report_submission_details WHERE report_id = ?').get(created.id)).provenance,'UNKNOWN');
  const own=await (await fetch(`${BASE_URL}/api/my/reports`,{headers:authed(token)})).json();
  assert.ok(own.data.some(r=>r.id===created.id && r.affected_area==='Two streets'));
  const publicResult=await (await fetch(`${BASE_URL}/api/reports/${created.id}`)).json();
  assert.equal(publicResult.data.affected_area,null);
  const admin=(await login(ADMIN_EMAIL, ADMIN_PASSWORD)).token;
  const analytics=await (await fetch(`${BASE_URL}/api/analytics/reports?category=LOW_PRESSURE`,{headers:authed(admin)})).json();
  assert.ok(analytics.success); assert.ok(analytics.data.categories.some(r=>r.label==='LOW_PRESSURE' && Number(r.count)>=1));
});
