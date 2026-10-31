import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { Pool, types } from 'pg';

// Postgres returns NUMERIC and BIGINT as strings to avoid precision loss, while SQLite
// returns numbers. Controllers and the UI were written against SQLite values, so parse
// them here instead of sprinkling Number() conversions everywhere.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value))); // NUMERIC
types.setTypeParser(20, (value) => (value === null ? null : Number(value))); // INT8 / COUNT(*)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase client (used if DB_MODE=supabase or for dual-sync)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
export const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-project-ref.supabase.co') 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// Built-in SQLite database
const dbDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.resolve(dbDir, 'majismart.db');
export const sqlite = new DatabaseSync(dbPath);

const dbMode = (process.env.DB_MODE || 'sqlite').toLowerCase();
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_CONNECTION_STRING;
if (dbMode === 'supabase' && !connectionString) {
  throw new Error('DATABASE_URL (or SUPABASE_DB_URL) is required when DB_MODE=supabase');
}
// pg-connection-string maps `sslmode=require` to verify-full semantics, and values parsed
// from the connection string override an explicit `ssl` option. Supabase's Supavisor
// pooler presents a chain that Node does not trust ("self-signed certificate in
// certificate chain"), so TLS was failing even though the API asked for
// rejectUnauthorized: false. Strip the ssl parameters from the URI and decide TLS
// ourselves: encrypted always in production, full verification only when explicitly
// requested with sslmode=verify-full / verify-ca.
function splitSslParams(rawConnectionString) {
  const queryIndex = rawConnectionString.indexOf('?');
  if (queryIndex === -1) return { connectionString: rawConnectionString, sslmode: null };

  const base = rawConnectionString.slice(0, queryIndex);
  const params = new URLSearchParams(rawConnectionString.slice(queryIndex + 1));
  const sslmode = (params.get('sslmode') || '').toLowerCase() || null;
  params.delete('sslmode');
  params.delete('uselibpqcompat');
  const rest = params.toString();

  return { connectionString: rest ? `${base}?${rest}` : base, sslmode };
}

const parsedConnection = connectionString ? splitSslParams(connectionString) : null;
const sslmode = parsedConnection?.sslmode || null;
const verifyCertificate = sslmode === 'verify-full' || sslmode === 'verify-ca';
const useTls = Boolean(parsedConnection) && (process.env.NODE_ENV === 'production' || Boolean(sslmode));

export const pool = dbMode === 'supabase'
  ? new Pool({
      connectionString: parsedConnection.connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000),
      application_name: 'majismart-api',
      ssl: useTls ? { rejectUnauthorized: verifyCertificate } : undefined
    })
  : null;

// Supabase's Supavisor pooler drops idle backends after a few minutes. Without this
// listener an idle-client error is an unhandled 'error' event and crashes the API.
pool?.on('error', (err) => {
  console.error('[Database] Idle client error:', err.message);
});

// Human-readable target for startup logs and failure handling. Never includes the
// password, so it is safe to print in Render/Fly logs.
export function describeDatabaseTarget() {
  if (!pool) return `sqlite (${dbPath})`;
  try {
    const url = new URL(connectionString);
    return `${url.username}@${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return 'DATABASE_URL could not be parsed as a URL';
  }
}

// Catches the mistakes that account for almost every failed first deploy.
export function databaseUrlWarnings() {
  if (!pool) return [];

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return ['DATABASE_URL is not a valid URI. It must start with postgresql:// and contain no unencoded spaces.'];
  }

  const warnings = [];
  if (/^db\..*\.supabase\.co$/i.test(url.hostname)) {
    warnings.push(
      'DATABASE_URL points at the direct Supabase host (IPv6-only). Render has no IPv6 egress - '
      + 'use the Transaction pooler string (aws-0-<region>.pooler.supabase.com:6543).'
    );
  }
  if (url.port === '5432') {
    warnings.push('DATABASE_URL uses port 5432 (direct/session). The Transaction pooler listens on 6543.');
  }
  if (!url.password) {
    warnings.push('DATABASE_URL has no password segment - did you forget to replace [YOUR-PASSWORD]?');
  }
  return warnings;
}
export const databaseMode = dbMode;

function postgresPlaceholders(sql) {
  let index = 0;
  return sql
    .replace(/datetime\('now'\s*,\s*'-(\d+)\s+hours?'\)/gi, "NOW() - INTERVAL '$1 hours'")
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/\?/g, () => `$${++index}`);
}

// Serialize SQLite operations so no other request can enter an asynchronous
// transaction while it is open. PostgreSQL uses a dedicated pooled client.
let sqliteQueue = Promise.resolve();
async function withSqliteLock(work) {
  const previous = sqliteQueue;
  let release;
  sqliteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}

export const db = {
  prepare(sql) {
    return {
      all: (...params) => db.all(sql, ...params),
      get: (...params) => db.get(sql, ...params),
      run: (...params) => db.run(sql, ...params)
    };
  },
  async all(sql, ...params) {
    if (pool) return (await pool.query(postgresPlaceholders(sql), params)).rows;
    return withSqliteLock(() => sqlite.prepare(sql).all(...params));
  },
  async get(sql, ...params) {
    if (pool) return (await pool.query(postgresPlaceholders(sql), params)).rows[0];
    return withSqliteLock(() => sqlite.prepare(sql).get(...params));
  },
  async run(sql, ...params) {
    if (pool) return pool.query(postgresPlaceholders(sql), params);
    return withSqliteLock(() => sqlite.prepare(sql).run(...params));
  },
  async transaction(work) {
    if (!pool) return withSqliteLock(async () => {
      sqlite.exec('BEGIN');
      const tx = {
        all: async (sql, ...params) => sqlite.prepare(sql).all(...params),
        get: async (sql, ...params) => sqlite.prepare(sql).get(...params),
        run: async (sql, ...params) => sqlite.prepare(sql).run(...params)
      };
      try { const result = await work(tx); sqlite.exec('COMMIT'); return result; }
      catch (err) { sqlite.exec('ROLLBACK'); throw err; }
    });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        all: async (sql, ...params) => (await client.query(postgresPlaceholders(sql), params)).rows,
        get: async (sql, ...params) => (await client.query(postgresPlaceholders(sql), params)).rows[0],
        run: async (sql, ...params) => client.query(postgresPlaceholders(sql), params)
      };
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  async healthCheck() {
    if (pool) await pool.query('SELECT 1');
    else sqlite.prepare('SELECT 1').get();
    return true;
  },
  async close() {
    if (pool) await pool.end();
  }
};

// Initialize schema and seed data
export async function initDatabase() {
  if (pool) {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/20261024000001_initial_schema.sql');
    const schemaState = await pool.query(`
      SELECT count(*)::int AS table_count
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'profiles',
          'monitoring_stations',
          'tanks',
          'monitoring_devices',
          'water_level_readings',
          'water_alerts',
          'community_reports',
          'report_status_history',
          'system_settings'
        )
    `);

    if (schemaState.rows[0].table_count < 9) {
      const autoMigrate = process.env.AUTO_MIGRATE === 'true'
        || process.env.NODE_ENV !== 'production';

      if (!autoMigrate) {
        // Production guardrail: schema changes belong in a reviewed migration step
        // (`supabase db push` in CI), not in application boot. Two instances booting at
        // once would race on DDL, and the runtime role should not own the schema.
        console.error(
          '[MajiSmart] Database schema is incomplete and AUTO_MIGRATE is disabled. '
          + 'Run `supabase db push` against this project before starting the API.'
        );
      } else {
        if (!fs.existsSync(migrationPath)) {
          throw new Error(
            `Database migration file not found at ${migrationPath}. `
            + 'Copy the supabase/migrations directory into the image or run migrations separately.'
          );
        }
        await pool.query('BEGIN');
        try {
          await pool.query(fs.readFileSync(migrationPath, 'utf8'));
          await pool.query('COMMIT');
        } catch (error) {
          await pool.query('ROLLBACK');
          throw error;
        }
      }
    }

    // Seeding on every boot would run ~45 statements each time a free-tier
    // instance wakes up. Only seed an actually empty database.
    const seeded = await pool.query('SELECT count(*)::int AS profile_count FROM public.profiles');
    if (seeded.rows[0].profile_count === 0) {
      await seedPostgresData();
    } else {
      console.log('[DB] Supabase baseline data already present, skipping seed');
    }
    return;
  }
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin', 'customer', 'technician')),
      phone_number TEXT,
      community TEXT,
      district TEXT,
      google_sub TEXT,
      avatar_url TEXT,
      auth_provider TEXT NOT NULL DEFAULT 'password',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitoring_stations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      community TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT 'Lusaka',
      province TEXT NOT NULL DEFAULT 'Lusaka Province',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'MAINTENANCE', 'INACTIVE')),
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tanks (
      id TEXT PRIMARY KEY,
      tank_id_code TEXT UNIQUE NOT NULL,
      station_id TEXT REFERENCES monitoring_stations(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      total_height_cm REAL NOT NULL DEFAULT 50.0,
      usable_height_cm REAL NOT NULL DEFAULT 50.0,
      sensor_offset_cm REAL NOT NULL DEFAULT 0.0,
      capacity_liters INTEGER NOT NULL DEFAULT 10000,
      low_threshold_percent REAL NOT NULL DEFAULT 25.0,
      critical_threshold_percent REAL NOT NULL DEFAULT 15.0,
      recovery_threshold_percent REAL NOT NULL DEFAULT 35.0,
      current_water_depth_cm REAL DEFAULT 0.0,
      current_water_percent REAL DEFAULT 0.0,
      current_status TEXT NOT NULL DEFAULT 'NORMAL' CHECK(current_status IN ('NORMAL', 'LOW', 'CRITICAL', 'OFFLINE', 'SENSOR_ERROR')),
      last_reading_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monitoring_devices (
      id TEXT PRIMARY KEY,
      device_id_code TEXT UNIQUE NOT NULL,
      tank_id TEXT REFERENCES tanks(id) ON DELETE SET NULL,
      api_key_hash TEXT NOT NULL,
      firmware_version TEXT DEFAULT 'v1.0.0',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK(status IN ('ONLINE', 'OFFLINE', 'ERROR')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS water_level_readings (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      tank_id TEXT NOT NULL,
      distance_cm REAL NOT NULL,
      water_depth_cm REAL NOT NULL,
      water_level_percent REAL NOT NULL,
      status TEXT NOT NULL,
      raw_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS water_alerts (
      id TEXT PRIMARY KEY,
      tank_id TEXT REFERENCES tanks(id) ON DELETE CASCADE,
      device_id TEXT,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('LOW_WATER', 'CRITICAL_WATER', 'DEVICE_OFFLINE', 'SENSOR_ERROR', 'WATER_RECOVERED')),
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
      acknowledged_by TEXT REFERENCES profiles(id),
      acknowledged_at TEXT,
      resolved_by TEXT REFERENCES profiles(id),
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS community_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      reporter_name TEXT,
      reporter_phone TEXT,
      category TEXT NOT NULL CHECK(category IN ('WATER_SHORTAGE', 'PIPE_LEAKAGE', 'BURST_PIPE', 'TANK_MALFUNCTION', 'WATER_QUALITY', 'OTHER')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location_name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      location_accuracy_m REAL,
      location_source TEXT,
      station_id TEXT REFERENCES monitoring_stations(id) ON DELETE SET NULL,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED')),
      admin_notes TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_status_history (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT REFERENCES profiles(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Lightweight in-file migration: CREATE TABLE IF NOT EXISTS never adds columns to
  // an existing SQLite file, so older dev databases are patched here.
  ensureSqliteProfileColumns();

  ensureSqliteReportColumns();

  // Apply idempotent local installation migration to existing SQLite databases.
  sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/002_installation.sql'), 'utf8'));

  sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/003_report_case.sql'), 'utf8'));

  sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/004_calibration.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.resolve(__dirname, '../../database/migrations/005_sensor_faults.sql'), 'utf8'));

  // Seed default data if profiles table is empty
  seedDefaultData();
}

// Adds the geolocation columns to a pre-existing SQLite database.
function ensureSqliteReportColumns() {
  const existing = new Set(sqlite.prepare('PRAGMA table_info(community_reports)').all().map((c) => c.name));
  const additions = [
    ['location_accuracy_m', 'REAL'],
    ['location_source', 'TEXT']
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      sqlite.exec(`ALTER TABLE community_reports ADD COLUMN ${name} ${type}`);
      console.log(`[DB] Added community_reports.${name} column`);
    }
  }
}

// Adds the Google sign-in columns to a pre-existing SQLite database.
function ensureSqliteProfileColumns() {
  const existing = new Set(sqlite.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name));
  const additions = [
    ['google_sub', 'TEXT'],
    ['avatar_url', 'TEXT'],
    ['auth_provider', "TEXT NOT NULL DEFAULT 'password'"]
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      sqlite.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${type}`);
      console.log(`[DB] Added profiles.${name} column`);
    }
  }
}

// Seeds the Supabase/PostgreSQL database with the same baseline the SQLite
// development database gets, so the deployed dashboard and mobile app are not
// empty on first boot. Every statement is idempotent (ON CONFLICT DO NOTHING),
// because this runs on every container start.
async function seedPostgresData() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'AdminPassword2026!');
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'CustomerPass2026!');
  if (!adminPassword || !customerPassword) {
    throw new Error('SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD are required when seeding PostgreSQL data.');
  }

  const apiKey = process.env.IOT_API_KEY;
  if (!apiKey) {
    throw new Error('IOT_API_KEY is required when seeding PostgreSQL devices.');
  }

  const apiKeyHash = hashPassword(apiKey);

  await db.transaction(async (tx) => {
    // --- Profiles -------------------------------------------------------------
    const profiles = [
      ['usr-admin-01', 'admin@majismart.zm', hashPassword(adminPassword), 'Mulenga Banda (Administrator)', 'admin', '+260971234567', 'Kabulonga', 'Lusaka'],
      ['usr-cust-01', 'mwape@community.zm', hashPassword(customerPassword), 'Mwape Tembo', 'customer', '+260967890123', 'Chilenje', 'Lusaka'],
      ['usr-cust-02', 'chanda@community.zm', hashPassword(customerPassword), 'Chanda Musonda', 'customer', '+260955432109', 'Matero', 'Lusaka']
    ];
    for (const p of profiles) {
      await tx.run(`
        INSERT INTO profiles (id, email, password_hash, full_name, role, phone_number, community, district)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (email) DO NOTHING
      `, ...p);
    }

    // --- Monitoring stations --------------------------------------------------
    const stations = [
      ['st-001', 'ST-LUS-001', 'Lusaka Central Water Hub', 'CBD / Cairo Road', 'Lusaka', 'Lusaka Province', -15.416667, 28.283333, 'Primary distribution reservoir supplying central business district and hospitals'],
      ['st-002', 'ST-CHL-002', 'Chilenje South Water Station', 'Chilenje', 'Lusaka', 'Lusaka Province', -15.4512, 28.3245, 'Community water tower serving Chilenje residential areas'],
      ['st-003', 'ST-MAT-003', 'Matero West Reservoir', 'Matero', 'Lusaka', 'Lusaka Province', -15.385, 28.261, 'High-density community reservoir with high throughput'],
      ['st-004', 'ST-CHEL-004', 'Chelston Depot Station', 'Chelston', 'Lusaka', 'Lusaka Province', -15.372, 28.381, 'Suburban storage tank supplying Chelston and Avondale'],
      ['st-005', 'ST-NDL-005', 'Ndola Hilltop Station', 'Hillcrest', 'Ndola', 'Copperbelt Province', -12.969, 28.636, 'Copperbelt provincial monitoring station']
    ];
    for (const s of stations) {
      await tx.run(`
        INSERT INTO monitoring_stations (id, code, name, community, district, province, latitude, longitude, status, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        ON CONFLICT (code) DO NOTHING
      `, ...s);
    }

    // --- Tanks ---------------------------------------------------------------
    // TANK_001 matches the hardware photo exactly: 50 cm usable, 15.5 cm sensor
    // distance, 34.5 cm water depth, 69%, NORMAL.
    const tanks = [
      ['tank-001', 'TANK_001', 'st-001', 'Lusaka CBD Primary Tank A', 50, 50, 15000, 25, 15, 35, 34.5, 69, 'NORMAL'],
      ['tank-002', 'TANK_002', 'st-002', 'Chilenje Tower Tank 1', 100, 100, 25000, 25, 15, 35, 22, 22, 'LOW'],
      ['tank-003', 'TANK_003', 'st-003', 'Matero Reservoir Tank B', 200, 200, 50000, 20, 10, 30, 170, 85, 'NORMAL'],
      ['tank-004', 'TANK_004', 'st-004', 'Chelston Feeder Tank', 150, 150, 20000, 25, 15, 35, 12, 8, 'CRITICAL'],
      ['tank-005', 'TANK_005', 'st-005', 'Ndola Copperbelt Tank', 180, 180, 30000, 20, 10, 30, 135, 75, 'NORMAL']
    ];
    for (const t of tanks) {
      await tx.run(`
        INSERT INTO tanks (id, tank_id_code, station_id, name, total_height_cm, usable_height_cm, sensor_offset_cm,
          capacity_liters, low_threshold_percent, critical_threshold_percent, recovery_threshold_percent,
          current_water_depth_cm, current_water_percent, current_status, last_reading_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON CONFLICT (tank_id_code) DO NOTHING
      `, ...t);
    }

    // --- Devices -------------------------------------------------------------
    const devices = [
      ['dev-001', 'ESP32_001', 'tank-001'],
      ['dev-002', 'ESP32_002', 'tank-002'],
      ['dev-003', 'ESP32_003', 'tank-003'],
      ['dev-004', 'ESP32_004', 'tank-004'],
      ['dev-005', 'ESP32_005', 'tank-005']
    ];
    for (const d of devices) {
      await tx.run(`
        INSERT INTO monitoring_devices (id, device_id_code, tank_id, api_key_hash, firmware_version, is_active, last_seen_at, status)
        VALUES (?, ?, ?, ?, 'v1.2.0', TRUE, NOW(), 'ONLINE')
        ON CONFLICT (device_id_code) DO NOTHING
      `, d[0], d[1], d[2], apiKeyHash);
    }

    // --- Initial reading (exact hardware contract) ---------------------------
    await tx.run(`
      INSERT INTO water_level_readings (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, 'rd-init-001', 'ESP32_001', 'TANK_001', 15.5, 34.5, 69, 'NORMAL', JSON.stringify({
      device_id: 'ESP32_001',
      tank_id: 'TANK_001',
      distance_cm: 15.5,
      water_depth_cm: 34.5,
      water_level_percent: 69,
      status: 'NORMAL'
    }));

    // --- 24h of history so charts are populated ------------------------------
    for (let i = 24; i >= 1; i--) {
      const depth = Number((32.0 + Math.sin(i / 3) * 5.0).toFixed(2));
      const dist = Number((50.0 - depth).toFixed(2));
      const percent = Math.round((depth / 50.0) * 100);
      await tx.run(`
        INSERT INTO water_level_readings (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'NORMAL', ?::jsonb, NOW() - (?::int * INTERVAL '1 hour'))
        ON CONFLICT (id) DO NOTHING
      `, `rd-hist-${i}`, 'ESP32_001', 'TANK_001', dist, depth, percent, JSON.stringify({
        device_id: 'ESP32_001',
        tank_id: 'TANK_001',
        distance_cm: dist,
        water_depth_cm: depth,
        water_level_percent: percent,
        status: 'NORMAL'
      }), i);
    }

    // --- Alerts --------------------------------------------------------------
    const alerts = [
      ['alt-001', 'tank-004', 'ESP32_004', 'CRITICAL_WATER', 'CRITICAL', 'Critically Low Water Level',
        'Chelston Feeder Tank water level is at 8% (below critical threshold of 15%). Immediate supply augmentation required.'],
      ['alt-002', 'tank-002', 'ESP32_002', 'LOW_WATER', 'WARNING', 'Low Water Level Advisory',
        'Chilenje Tower Tank 1 water level is at 22% (below low threshold of 25%). Monitoring supply inflow.']
    ];
    for (const a of alerts) {
      await tx.run(`
        INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW() - INTERVAL '2 hours')
        ON CONFLICT (id) DO NOTHING
      `, ...a);
    }

    // --- Community reports ---------------------------------------------------
    const reports = [
      ['rep-001', 'usr-cust-01', 'Mwape Tembo', '+260967890123', 'WATER_SHORTAGE',
        'Low pressure & water cut in Section 4',
        'Water taps have had zero pressure since yesterday morning. Over 40 households affected in Chilenje South.',
        'Chilenje South, near Market 4', -15.452, 28.326, 'st-002', 'IN_PROGRESS',
        'Field technician dispatched to inspect pump station booster valve.'],
      ['rep-002', 'usr-cust-02', 'Chanda Musonda', '+260955432109', 'PIPE_LEAKAGE',
        'Clean water gushing from distribution pipe',
        'Substantial pipe leak on Commonwealth Avenue near Matero clinic. Clean treated water is flooding the roadside.',
        'Matero, Commonwealth Ave', -15.3875, 28.2635, 'st-003', 'SUBMITTED', null],
      ['rep-003', 'usr-cust-01', 'Mwape Tembo', '+260967890123', 'WATER_QUALITY',
        'Brownish discolouration in tap water',
        'Water coming out of tap has sediment and slight brown tint after morning supply resumption.',
        'Chelston Green, Plot 144', -15.3745, 28.3835, 'st-004', 'ACKNOWLEDGED',
        'Flushing of Chelston sub-mains scheduled for 16:00 today.']
    ];
    for (const r of reports) {
      await tx.run(`
        INSERT INTO community_reports (id, reporter_id, reporter_name, reporter_phone, category, title, description,
          location_name, latitude, longitude, station_id, status, admin_notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL '1 day')
        ON CONFLICT (id) DO NOTHING
      `, ...r);
    }

    // --- Report status history ----------------------------------------------
    const history = [
      ['hist-001', 'rep-001', 'SUBMITTED', 'ACKNOWLEDGED', 'Report reviewed by dispatch team.'],
      ['hist-002', 'rep-001', 'ACKNOWLEDGED', 'IN_PROGRESS', 'Field team assigned to inspect valve.'],
      ['hist-003', 'rep-003', 'SUBMITTED', 'ACKNOWLEDGED', 'Water quality team notified for sampling.']
    ];
    for (const h of history) {
      await tx.run(`
        INSERT INTO report_status_history (id, report_id, previous_status, new_status, changed_by, notes, created_at)
        VALUES (?, ?, ?, ?, 'usr-admin-01', ?, NOW() - INTERVAL '18 hours')
        ON CONFLICT (id) DO NOTHING
      `, ...h);
    }
  });
}

// Simple deterministic hash for password check
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_majismart_salt').digest('hex');
}

function seedDefaultData() {
  const profileCount = sqlite.prepare('SELECT count(*) as count FROM profiles').get();
  if (profileCount.count > 0) {
    return; // Already seeded
  }

  console.log('[DB] Seeding MajiSmart Zambia baseline data...');

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'AdminPassword2026!');
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'CustomerPass2026!');
  if (!adminPassword || !customerPassword) {
    throw new Error('SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD are required when seeding production data.');
  }
  const adminPass = hashPassword(adminPassword);
  const customerPass = hashPassword(customerPassword);
  const apiKeyHash = hashPassword(process.env.IOT_API_KEY || 'development-device-key');

  // Insert Profiles
  const insertProfile = sqlite.prepare(`
    INSERT INTO profiles (id, email, password_hash, full_name, role, phone_number, community, district)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProfile.run('usr-admin-01', 'admin@majismart.zm', adminPass, 'Mulenga Banda (Administrator)', 'admin', '+260971234567', 'Kabulonga', 'Lusaka');
  insertProfile.run('usr-cust-01', 'mwape@community.zm', customerPass, 'Mwape Tembo', 'customer', '+260967890123', 'Chilenje', 'Lusaka');
  insertProfile.run('usr-cust-02', 'chanda@community.zm', customerPass, 'Chanda Musonda', 'customer', '+260955432109', 'Matero', 'Lusaka');

  // Insert Stations
  const insertStation = sqlite.prepare(`
    INSERT INTO monitoring_stations (id, code, name, community, district, province, latitude, longitude, status, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStation.run('st-001', 'ST-LUS-001', 'Lusaka Central Water Hub', 'CBD / Cairo Road', 'Lusaka', 'Lusaka Province', -15.416667, 28.283333, 'ACTIVE', 'Primary distribution reservoir supplying central business district and hospitals');
  insertStation.run('st-002', 'ST-CHL-002', 'Chilenje South Water Station', 'Chilenje', 'Lusaka', 'Lusaka Province', -15.451200, 28.324500, 'ACTIVE', 'Community water tower serving Chilenje residential areas');
  insertStation.run('st-003', 'ST-MAT-003', 'Matero West Reservoir', 'Matero', 'Lusaka', 'Lusaka Province', -15.385000, 28.261000, 'ACTIVE', 'High-density community reservoir with high throughput');
  insertStation.run('st-004', 'ST-CHEL-004', 'Chelston Depot Station', 'Chelston', 'Lusaka', 'Lusaka Province', -15.372000, 28.381000, 'ACTIVE', 'Suburban storage tank supplying Chelston and Avondale');
  insertStation.run('st-005', 'ST-NDL-005', 'Ndola Hilltop Station', 'Hillcrest', 'Ndola', 'Copperbelt Province', -12.969000, 28.636000, 'ACTIVE', 'Copperbelt provincial monitoring station');

  // Insert Tanks (TANK_001 matches photo exactly: total 50cm, depth 34.5cm, dist 15.5cm, 69%, NORMAL)
  const insertTank = sqlite.prepare(`
    INSERT INTO tanks (id, tank_id_code, station_id, name, total_height_cm, usable_height_cm, capacity_liters, low_threshold_percent, critical_threshold_percent, recovery_threshold_percent, current_water_depth_cm, current_water_percent, current_status, last_reading_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insertTank.run('tank-001', 'TANK_001', 'st-001', 'Lusaka CBD Primary Tank A', 50.0, 50.0, 15000, 25.0, 15.0, 35.0, 34.5, 69.0, 'NORMAL');
  insertTank.run('tank-002', 'TANK_002', 'st-002', 'Chilenje Tower Tank 1', 100.0, 100.0, 25000, 25.0, 15.0, 35.0, 22.0, 22.0, 'LOW');
  insertTank.run('tank-003', 'TANK_003', 'st-003', 'Matero Reservoir Tank B', 200.0, 200.0, 50000, 20.0, 10.0, 30.0, 170.0, 85.0, 'NORMAL');
  insertTank.run('tank-004', 'TANK_004', 'st-004', 'Chelston Feeder Tank', 150.0, 150.0, 20000, 25.0, 15.0, 35.0, 12.0, 8.0, 'CRITICAL');
  insertTank.run('tank-005', 'TANK_005', 'st-005', 'Ndola Copperbelt Tank', 180.0, 180.0, 30000, 20.0, 10.0, 30.0, 135.0, 75.0, 'NORMAL');

  // Insert Monitoring Devices (ESP32_001 matches photo)
  const insertDevice = sqlite.prepare(`
    INSERT INTO monitoring_devices (id, device_id_code, tank_id, api_key_hash, firmware_version, is_active, last_seen_at, status)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), ?)
  `);

  insertDevice.run('dev-001', 'ESP32_001', 'tank-001', apiKeyHash, 'v1.2.0', 'ONLINE');
  insertDevice.run('dev-002', 'ESP32_002', 'tank-002', apiKeyHash, 'v1.2.0', 'ONLINE');
  insertDevice.run('dev-003', 'ESP32_003', 'tank-003', apiKeyHash, 'v1.2.0', 'ONLINE');
  insertDevice.run('dev-004', 'ESP32_004', 'tank-004', apiKeyHash, 'v1.2.0', 'ONLINE');
  insertDevice.run('dev-005', 'ESP32_005', 'tank-005', apiKeyHash, 'v1.2.0', 'ONLINE');

  // Insert Initial Reading matching photo
  const insertReading = sqlite.prepare(`
    INSERT INTO water_level_readings (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertReading.run(
    'rd-init-001',
    'ESP32_001',
    'TANK_001',
    15.5,
    34.5,
    69.0,
    'NORMAL',
    JSON.stringify({
      device_id: 'ESP32_001',
      tank_id: 'TANK_001',
      distance_cm: 15.5,
      water_depth_cm: 34.5,
      water_level_percent: 69,
      status: 'NORMAL'
    })
  );

  // Add historical simulated readings over last 24h for TANK_001 to power charts
  const now = Date.now();
  for (let i = 24; i >= 1; i--) {
    const timestamp = new Date(now - i * 3600 * 1000).toISOString();
    const depth = 32.0 + Math.sin(i / 3) * 5.0; // Oscillates between ~27 and ~37 cm
    const dist = 50.0 - depth;
    const percent = Math.round((depth / 50.0) * 100);
    const readingId = `rd-hist-${i}`;
    sqlite.prepare(`
      INSERT INTO water_level_readings (id, device_id, tank_id, distance_cm, water_depth_cm, water_level_percent, status, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(readingId, 'ESP32_001', 'TANK_001', dist, depth, percent, 'NORMAL', JSON.stringify({ device_id: 'ESP32_001', tank_id: 'TANK_001', distance_cm: dist, water_depth_cm: depth, water_level_percent: percent, status: 'NORMAL' }), timestamp);
  }

  // Insert Water Alerts
  const insertAlert = sqlite.prepare(`
    INSERT INTO water_alerts (id, tank_id, device_id, alert_type, severity, title, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'))
  `);

  insertAlert.run('alt-001', 'tank-004', 'ESP32_004', 'CRITICAL_WATER', 'CRITICAL', 'Critically Low Water Level', 'Chelston Feeder Tank water level is at 8% (below critical threshold of 15%). Immediate supply augmentation required.', 'ACTIVE');
  insertAlert.run('alt-002', 'tank-002', 'ESP32_002', 'LOW_WATER', 'WARNING', 'Low Water Level Advisory', 'Chilenje Tower Tank 1 water level is at 22% (below low threshold of 25%). Monitoring supply inflow.', 'ACTIVE');

  // Insert Community Reports
  const insertReport = sqlite.prepare(`
    INSERT INTO community_reports (id, reporter_id, reporter_name, reporter_phone, category, title, description, location_name, latitude, longitude, station_id, status, admin_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'))
  `);

  insertReport.run(
    'rep-001',
    'usr-cust-01',
    'Mwape Tembo',
    '+260967890123',
    'WATER_SHORTAGE',
    'Low pressure & water cut in Section 4',
    'Water taps have had zero pressure since yesterday morning. Over 40 households affected in Chilenje South.',
    'Chilenje South, near Market 4',
    -15.452000,
    28.326000,
    'st-002',
    'IN_PROGRESS',
    'Field technician dispatched to inspect pump station booster valve.'
  );

  insertReport.run(
    'rep-002',
    'usr-cust-02',
    'Chanda Musonda',
    '+260955432109',
    'PIPE_LEAKAGE',
    'Clean water gushing from distribution pipe',
    'Substantial pipe leak on Commonwealth Avenue near Matero clinic. Clean treated water is flooding the roadside.',
    'Matero, Commonwealth Ave',
    -15.387500,
    28.263500,
    'st-003',
    'SUBMITTED',
    null
  );

  insertReport.run(
    'rep-003',
    'usr-cust-01',
    'Mwape Tembo',
    '+260967890123',
    'WATER_QUALITY',
    'Brownish discolouration in tap water',
    'Water coming out of tap has sediment and slight brown tint after morning supply resumption.',
    'Chelston Green, Plot 144',
    -15.374500,
    28.383500,
    'st-004',
    'ACKNOWLEDGED',
    'Flushing of Chelston sub-mains scheduled for 16:00 today.'
  );

  // Insert Report Status History
  const insertHistory = sqlite.prepare(`
    INSERT INTO report_status_history (id, report_id, previous_status, new_status, changed_by, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-18 hours'))
  `);

  insertHistory.run('hist-001', 'rep-001', 'SUBMITTED', 'ACKNOWLEDGED', 'usr-admin-01', 'Report reviewed by dispatch team.');
  insertHistory.run('hist-002', 'rep-001', 'ACKNOWLEDGED', 'IN_PROGRESS', 'usr-admin-01', 'Field team assigned to inspect valve.');
  insertHistory.run('hist-003', 'rep-003', 'SUBMITTED', 'ACKNOWLEDGED', 'usr-admin-01', 'Water quality team notified for sampling.');

  console.log('[DB] MajiSmart baseline seeded successfully!');
}
