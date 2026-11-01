#!/usr/bin/env node
// Provision SIMULATED installations for the seeded demo tanks.
//
// Why this exists: from migration 20261031000004 onwards, telemetry is
// geometry-derived. A tank with no installation record cannot ingest readings,
// and unknown devices no longer self-register. A freshly seeded database
// therefore shows every tank OFFLINE until somebody configures it - correct for
// a real utility, but it makes the public demo look broken.
//
// DEMO_MODE synthetic telemetry only feeds tanks whose installation provenance is
// SIMULATED and whose device credential is the shared IOT_API_KEY. This script
// creates exactly that: one SIMULATED installation, one device whose credential
// is IOT_API_KEY, three calibration tests and a calibration approval per tank.
//
// SAFETY
//   * Demo use only. The device credential is a shared environment secret, which
//     is unacceptable for real sensors - provision those by hand with unique keys.
//   * Idempotent: tanks that already have an installation are skipped.
//   * Never prints the credential.
//
// USAGE
//   API_BASE_URL=https://majismart-api.onrender.com \
//   ADMIN_EMAIL=admin@majismart.zm ADMIN_PASSWORD='...' \
//   IOT_API_KEY='...' node BACKEND/scripts/provision-demo-tanks.mjs
//
//   Add --dry-run to print the plan without writing anything.

const base = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const deviceKey = process.env.IOT_API_KEY;
const dryRun = process.argv.includes('--dry-run');

// Calibration tolerance in cm. The generated geometry is linear, so the tests
// agree exactly; the approval still records an explicit, reviewable decision.
const MAX_ERROR_CM = 1;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* non-JSON error page */ }
  if (!response.ok || (payload && payload.success === false)) {
    fail(`${method} ${path} → ${response.status} ${payload?.error || '(no error message)'}`);
  }
  return payload;
}

function geometryFor(tank) {
  // A seeded tank only carries a usable height and a nominal capacity in litres.
  // Derive an equivalent vertical cylinder so the derived volume matches the
  // manufacturer figure as closely as the data allows.
  const height = Number(tank.usable_height_cm || tank.total_height_cm || 200);
  const capacityLitres = Number(tank.capacity_liters || 10000);
  const diameter = 2 * Math.sqrt((capacityLitres * 1000) / (Math.PI * height));
  return { height_cm: Number(height.toFixed(2)), diameter_cm: Number(diameter.toFixed(2)) };
}

function distanceFor(percent, emptyDistance) {
  return Number((emptyDistance - (emptyDistance - 10) * (percent / 100)).toFixed(2));
}

async function main() {
  if (!email || !password) fail('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  if (!deviceKey || deviceKey.length < 24) fail('IOT_API_KEY (24+ characters) is required as the demo device credential');

  console.log(`API      : ${base}`);
  console.log(`Mode     : ${dryRun ? 'DRY RUN (no writes)' : 'writing'}\n`);

  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  const token = login.token;
  if (!token) fail('Login succeeded but returned no token');

  const tanks = (await api('/api/tanks', { token })).data || [];
  const configured = new Set(((await api('/api/installations', { token })).data || []).map((row) => row.id));
  const pending = tanks.filter((tank) => !configured.has(tank.id));

  if (!pending.length) {
    console.log('Nothing to do: every tank already has an installation.');
    return;
  }

  for (const tank of pending) {
    const geometry = geometryFor(tank);
    const emptyDistance = Number((geometry.height_cm + 10).toFixed(2));
    const payload = {
      existing_tank_id: tank.id,
      device_id: `SIM_${tank.tank_id_code}`,
      device_key: deviceKey,
      shape: 'vertical_cylinder',
      height_cm: geometry.height_cm,
      diameter_cm: geometry.diameter_cm,
      empty_distance_cm: emptyDistance,
      full_distance_cm: 10,
      provenance: 'SIMULATED',
      sensor_model: 'DEMO-TELEMETRY',
      mounting_position: 'TOP',
      installer_notes: 'Provisioned by provision-demo-tanks.mjs for DEMO_MODE synthetic telemetry.'
    };

    console.log(`• ${tank.tank_id_code} (${tank.name})`);
    console.log(`    geometry   : vertical cylinder ${geometry.height_cm} cm × ${geometry.diameter_cm} cm, empty ${emptyDistance} cm, full 10 cm`);
    console.log(`    device     : SIM_${tank.tank_id_code} (credential = IOT_API_KEY)`);

    if (dryRun) continue;

    const created = await api('/api/installations', { method: 'POST', body: payload, token });
    console.log(`    created    : ${created.data.calculated_capacity_l.toFixed(0)} L usable`);

    // Three tests, one per depth band, because verification reads the latest test
    // in each band and a single middle-depth test cannot approve the installation.
    for (const percent of [20, 50, 80]) {
      const depth = Number((geometry.height_cm * (percent / 100)).toFixed(2));
      const result = await api(`/api/installations/${tank.id}/calibration-tests`, {
        method: 'POST',
        body: { distance_cm: distanceFor(percent, emptyDistance), manual_depth_cm: depth },
        token
      });
      console.log(`    test ${String(percent).padStart(2)}% : depth ${result.data.calculated_depth_cm} cm, error ${result.data.depth_error_cm} cm`);
    }

    const verified = await api(`/api/installations/${tank.id}/verify-calibration`, {
      method: 'POST',
      body: { max_error_cm: MAX_ERROR_CM },
      token
    });
    console.log(`    status     : ${verified.data.installation_status}\n`);
  }

  console.log('Done. With DEMO_MODE=true the API now emits synthetic readings for these tanks.');
}

main().catch((error) => fail(error.message));
