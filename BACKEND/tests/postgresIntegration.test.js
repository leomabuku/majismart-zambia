import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const configured = Boolean(process.env.TEST_DATABASE_URL);

test('PostgreSQL persistence integration (requires TEST_DATABASE_URL)', { skip: !configured }, async () => {
  process.env.DB_MODE = 'supabase';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.SEED_ADMIN_PASSWORD ||= 'integration-admin-password';
  process.env.SEED_CUSTOMER_PASSWORD ||= 'integration-customer-password';
  process.env.IOT_API_KEY ||= 'integration-device-key';

  const { db, initDatabase } = await import('../src/database/db.js');
  await initDatabase();

  assert.equal(await db.healthCheck(), true);
  const admin = await db.prepare('SELECT role FROM profiles WHERE email = ?').get('admin@majismart.zm');
  assert.equal(admin.role, 'admin');

  const tank = await db.prepare('SELECT id, tank_id_code FROM tanks WHERE tank_id_code = ?').get('TANK_001');
  assert.equal(tank.tank_id_code, 'TANK_001');

  const readingId = `integration-${crypto.randomUUID()}`;
  await db.transaction(async (tx) => {
    await tx.run(`
      INSERT INTO water_level_readings
        (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
    `, readingId, 'ESP32_INTEGRATION', 'TANK_001', 15.5, 34.5, 69, 'NORMAL', '{}');
  });
  const reading = await db.prepare('SELECT water_level_percent FROM water_level_readings WHERE id = ?').get(readingId);
  assert.equal(Number(reading.water_level_percent), 69);
  await db.prepare('DELETE FROM water_level_readings WHERE id = ?').run(readingId);

  const rollbackId = `rollback-${crypto.randomUUID()}`;
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.run(`
        INSERT INTO community_reports
          (id, category, title, description, location_name, status)
        VALUES (?, 'OTHER', 'Rollback test', 'Rollback test', 'Test location', 'SUBMITTED')
      `, rollbackId);
      throw new Error('force rollback');
    }),
    /force rollback/
  );
  const rolledBack = await db.prepare('SELECT id FROM community_reports WHERE id = ?').get(rollbackId);
  assert.equal(rolledBack, undefined);

  await db.close();
});
