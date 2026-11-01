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

import { initDatabase, db, databaseMode } from './database/db.js';
import { realtime } from './services/realtimeService.js';
import { DeviceMonitorService } from './services/deviceMonitorService.js';
import { IoTController } from './controllers/iotController.js';
import { AuthController } from './controllers/authController.js';
import { StationController } from './controllers/stationController.js';
import { ReportController } from './controllers/reportController.js';
import { getReportAnalytics } from './controllers/reportAnalyticsController.js';
import { AlertController } from './controllers/alertController.js';
import { WeatherController } from './controllers/weatherController.js';
import { authenticateToken, optionalAuth, requireAdmin } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database & Seed
await initDatabase();

// Start Background Device Heartbeat Monitor
DeviceMonitorService.start();

const app = express();
const PORT = process.env.PORT || 5000;

const configuredOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Enable CORS for web and mobile clients
app.use(cors({
  origin: configuredOrigins.includes('*') ? '*' : configuredOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Body parsers
app.use(express.json({ limit: '10mb' })); // Support base64 image uploads in reports
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    await db.healthCheck();
    res.json({
    status: 'ONLINE',
    system: 'MajiSmart Zambia Core API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    sse_clients: realtime.getClientCount(),
    db_mode: databaseMode
    });
  } catch {
    res.status(503).json({ status: 'DEGRADED', system: 'MajiSmart Zambia Core API', error: 'Database unavailable' });
  }
});

// Realtime SSE Stream Endpoint
app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  realtime.addClient(res);
});

// ==========================================
// 1. IOT TELEMETRY INGESTION (Matches Photo)
// ==========================================
// Primary endpoint for ESP32 and simulator
app.post('/api/iot/readings', IoTController.ingestReading);
app.post('/api/readings', IoTController.ingestReading); // Alias
app.get('/api/iot/history/:tank_id', IoTController.getReadingsHistory);

// Simulator helper endpoint (lets UI/subagent trigger realistic telemetry effortlessly)
app.post('/api/simulator/send', (req, res) => {
  const { tank_id = 'TANK_001', device_id = 'ESP32_001', distance_cm, water_depth_cm, water_level_percent, status } = req.body;
  
  // Create mock request to reuse exact ingestion logic
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
app.post('/api/auth/register', AuthController.register);
app.get('/api/auth/me', authenticateToken, AuthController.getProfile);

// ==========================================
// 3. MONITORING STATIONS & TANKS
// ==========================================
app.get('/api/dashboard/summary', StationController.getSummary);
app.get('/api/stations', StationController.getAllStations);
app.get('/api/stations/:id', StationController.getStationById);
app.get('/api/tanks', StationController.getAllTanks);
app.get('/api/tanks/:id', StationController.getTankById);
app.put('/api/tanks/:id', authenticateToken, requireAdmin, StationController.updateTank);

// ==========================================
// 4. COMMUNITY REPORTS
// ==========================================
app.get('/api/reports', optionalAuth, ReportController.getAllReports);
app.get('/api/reports/analytics', authenticateToken, requireAdmin, getReportAnalytics);
app.get('/api/reports/:id', optionalAuth, ReportController.getReportById);
app.post('/api/reports', optionalAuth, ReportController.createReport);
app.put('/api/reports/:id/status', authenticateToken, requireAdmin, ReportController.updateStatus);

// ==========================================
// 5. WATER ALERTS
// ==========================================
app.get('/api/alerts', AlertController.getAlerts);
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

export { server };
export default app;

