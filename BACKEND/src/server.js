import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  const requiredProductionEnv = ['JWT_SECRET', 'IOT_API_KEY', 'CORS_ORIGINS'];
  if ((process.env.DB_MODE || 'sqlite').toLowerCase() === 'supabase') {
    requiredProductionEnv.push('DATABASE_URL', 'SEED_ADMIN_PASSWORD', 'SEED_CUSTOMER_PASSWORD');
  }
  const missingProductionEnv = requiredProductionEnv.filter((name) => !process.env[name]);
  if (missingProductionEnv.length > 0) {
    throw new Error(`Missing required production environment variables: ${missingProductionEnv.join(', ')}`);
  }
}

import { initDatabase, db, databaseMode, describeDatabaseTarget, databaseUrlWarnings } from './database/db.js';
import { realtime } from './services/realtimeService.js';
import { DeviceMonitorService } from './services/deviceMonitorService.js';
import { DemoTelemetryService } from './services/demoTelemetryService.js';
import { isGoogleAuthConfigured } from './services/googleAuthService.js';
import { IoTController } from './controllers/iotController.js';
import { AuthController } from './controllers/authController.js';
import { UserController } from './controllers/userController.js';
import { StationController } from './controllers/stationController.js';
import { ReportController } from './controllers/reportController.js';
import { CaseController } from './controllers/caseController.js';
import { InstallationController } from './controllers/installationController.js';
import { AnalyticsController } from './controllers/analyticsController.js';
import { AlertController } from './controllers/alertController.js';
import { WeatherController } from './controllers/weatherController.js';
import { authenticateToken, optionalAuth, requireAdmin } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connectivity diagnostics: printed on every boot so a failed deploy explains itself
// in the Render/Fly logs instead of exiting silently.
const databaseTarget = describeDatabaseTarget();
console.log(`[MajiSmart] Node ${process.version} | db_mode=${databaseMode} | target=${databaseTarget}`);
for (const warning of databaseUrlWarnings()) {
  console.warn(`[MajiSmart] DATABASE_URL warning: ${warning}`);
}

// Initialize Database & Seed
try {
  await initDatabase();
} catch (error) {
  console.error('[MajiSmart] Database initialisation failed - the API cannot start.');
  console.error(`  target : ${databaseTarget}`);
  console.error(`  reason : ${error.message}`);
  console.error(
    '  check  : DATABASE_URL must be the Supabase Transaction pooler '
    + '(aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require), '
    + 'the password must be URL-encoded, and the database password must match the project.'
  );
  process.exit(1);
}

// Start Background Device Heartbeat Monitor
DeviceMonitorService.start();

// Optional synthetic telemetry (DEMO_MODE=true) - keeps a hardware-less demo alive.
DemoTelemetryService.start();

const app = express();
const PORT = process.env.PORT || 5000;

// Behind Fly.io / Render / Cloudflare the client IP arrives via X-Forwarded-For.
// Without this, rate limiting and request logging see the proxy IP for every user.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
}

const configuredOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Enable CORS for web and mobile clients
app.use(cors({
  origin: configuredOrigins.includes('*') ? '*' : configuredOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-simulation']
}));

// Body parsers
app.use(express.json({ limit: '10mb' })); // Support base64 image uploads in reports
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await db.healthCheck();
    res.json({
    status: 'ONLINE',
    system: 'SmartWater Zambia Core API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    sse_clients: realtime.getClientCount(),
    db_mode: databaseMode,
    // Lets an operator confirm the Google OAuth client id reached this instance
    // without reading the env var. Never exposes the value itself.
    google_signin: isGoogleAuthConfigured()
    });
  } catch {
    res.status(503).json({ status: 'DEGRADED', system: 'SmartWater Zambia Core API', error: 'Database unavailable' });
  }
});

// Realtime SSE Stream Endpoint
app.get('/api/realtime/stream', (req, res) => {
  const requestOrigin = req.headers.origin;
  const originAllowed = configuredOrigins.includes('*')
    || (requestOrigin && configuredOrigins.includes(requestOrigin));

  if (requestOrigin && !originAllowed) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable nginx/Cloudflare buffering so events are flushed immediately.
  res.setHeader('X-Accel-Buffering', 'no');
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.flushHeaders?.();

  realtime.addClient(res);
});

// ==========================================
// 1. IOT TELEMETRY INGESTION (Matches Photo)
// ==========================================
// Primary endpoint for ESP32 and simulator
app.post('/api/iot/readings', IoTController.ingestReading);
app.post('/api/readings', IoTController.ingestReading); // Alias
app.get('/api/iot/history/:tank_id', optionalAuth, IoTController.getReadingsHistory);

// Simulator helper endpoint (lets UI/subagent trigger realistic telemetry effortlessly)
app.post('/api/simulator/send', (req, res) => {
  const { tank_id = 'TANK_001', device_id = 'ESP32_001', distance_cm, water_depth_cm, water_level_percent, status } = req.body;
  
  // Mark simulator calls; ingestion still checks device credentials and provenance.
  req.headers['x-simulation'] = 'true';
  req.body = {
    device_id,
    tank_id,
    distance_cm: typeof distance_cm === 'number' ? distance_cm : 15.5,
    water_depth_cm: typeof water_depth_cm === 'number' ? water_depth_cm : 34.5,
    water_level_percent: typeof water_level_percent === 'number' ? water_level_percent : 69,
    status: status || 'NORMAL'
  };
  return IoTController.ingestReading(req, res);
});

// ==========================================
// 2. AUTHENTICATION & PROFILES
// ==========================================
app.post('/api/auth/login', AuthController.login);
app.post('/api/auth/google', AuthController.googleLogin);
app.post('/api/auth/logout', AuthController.logout);
app.post('/api/auth/register', AuthController.register);
app.get('/api/auth/me', authenticateToken, AuthController.getProfile);

// Admin-only user directory and role management (Settings > Team & Roles).
app.get('/api/users', authenticateToken, requireAdmin, UserController.listUsers);
app.patch('/api/users/:id/role', authenticateToken, requireAdmin, UserController.updateRole);

// ==========================================
// 3. MONITORING STATIONS & TANKS
// ==========================================
app.get('/api/dashboard/summary', StationController.getSummary);
app.get('/api/stations', optionalAuth, StationController.getAllStations);
app.get('/api/stations/:id', optionalAuth, StationController.getStationById);
app.get('/api/my/tanks', authenticateToken, StationController.getMyTanks);
app.get('/api/tanks', optionalAuth, StationController.getAllTanks);
app.get('/api/tanks/:id', optionalAuth, StationController.getTankById);
app.get('/api/installations', authenticateToken, requireAdmin, InstallationController.list);
app.get('/api/installations/:id/calibration-tests', authenticateToken, requireAdmin, InstallationController.calibrationHistory);
app.post('/api/installations', authenticateToken, requireAdmin, InstallationController.create);
app.post('/api/installations/:id/device', authenticateToken, requireAdmin, InstallationController.replaceDevice);
app.post('/api/installations/:id/calibration-tests', authenticateToken, requireAdmin, InstallationController.calibrationTest);
app.post('/api/installations/:id/verify-calibration', authenticateToken, requireAdmin, InstallationController.verifyCalibration);
app.put('/api/devices/:device_id/credential', authenticateToken, requireAdmin, InstallationController.deviceCredential);
app.put('/api/tanks/:id', authenticateToken, requireAdmin, StationController.updateTank);

// ==========================================
// 4. COMMUNITY REPORTS
// ==========================================
app.get('/api/analytics/sensor-faults', authenticateToken, requireAdmin, AnalyticsController.sensorFaults);
app.get('/api/analytics/telemetry', authenticateToken, requireAdmin, AnalyticsController.telemetry);
app.get('/api/analytics/reports', authenticateToken, requireAdmin, AnalyticsController.reports);
app.get('/api/my/reports', authenticateToken, (req, res) => { req.query.reporter_id = req.user.id; return ReportController.getAllReports(req, res); });
app.get('/api/reports', optionalAuth, ReportController.getAllReports);
app.get('/api/reports/:id/case', authenticateToken, requireAdmin, CaseController.list);
app.post('/api/reports/:id/case', authenticateToken, requireAdmin, CaseController.create);
app.get('/api/reports/:id', optionalAuth, ReportController.getReportById);
app.post('/api/reports', optionalAuth, ReportController.createReport);
app.put('/api/reports/:id/status', authenticateToken, requireAdmin, ReportController.updateStatus);

// ==========================================
// 5. WATER ALERTS
// ==========================================
app.get('/api/alerts', optionalAuth, AlertController.getAlerts);
app.put('/api/alerts/:id/acknowledge', authenticateToken, requireAdmin, AlertController.acknowledgeAlert);
app.put('/api/alerts/:id/resolve', authenticateToken, requireAdmin, AlertController.resolveAlert);

// ==========================================
// 6. CLIMATE & WEATHER
// ==========================================
app.get('/api/weather', WeatherController.getWeather);

import fs from 'node:fs';

// Serve frontend web dashboard if built
const distPath = path.resolve(__dirname, '../../WEB/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[MajiSmart Error]', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Start listening
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  MajiSmart Zambia - Shared Backend Running on port ${PORT}`);
  console.log(`  IoT Ingestion: POST http://localhost:${PORT}/api/iot/readings`);
  console.log(`  Realtime SSE:  GET  http://localhost:${PORT}/api/realtime/stream`);
  console.log(`  Dashboard API: GET  http://localhost:${PORT}/api/dashboard/summary`);
  console.log(`=======================================================`);
});

export function shutdownServer() {
  DeviceMonitorService.stop();
  DemoTelemetryService.stop();
  // SSE streams never finish on their own; close them so server.close() can resolve.
  realtime.closeAll();
  return new Promise((resolve, reject) => {
    server.close(async (err) => {
      if (err) reject(err);
      else {
        try {
          await db.close();
          resolve();
        } catch (closeError) {
          reject(closeError);
        }
      }
    });
  });
}

// Fly.io / Render send SIGTERM before replacing an instance. Without a handler the
// process is killed mid-request and clients see dropped connections on every deploy.
// Only wire this when the file is the process entry point (tests import it directly).
const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isEntryPoint) {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      console.log(`[MajiSmart] ${signal} received, shutting down gracefully...`);
      const forceExit = setTimeout(() => {
        console.error('[MajiSmart] Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 15000));
      forceExit.unref();
      try {
        await shutdownServer();
        clearTimeout(forceExit);
        console.log('[MajiSmart] Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[MajiSmart] Shutdown error:', error);
        process.exit(1);
      }
    });
  }
}

export { server };
export default app;
