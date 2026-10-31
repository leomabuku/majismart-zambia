# MajiSmart Zambia 🇿🇲

> Telemetry contract and setup have changed. See [integrated telemetry notes](docs/INTEGRATED_TELEMETRY.md); older examples below describe the legacy workflow.

### IoT-Enabled Smart Water Monitoring and Climate Resilience System

MajiSmart Zambia is a production-minded IoT water management and civic incident reporting platform developed for Zambian water utilities and community members. It connects ultrasonic-equipped ESP32 hardware devices, a shared REST/Realtime backend, an administrative web dashboard, and a native Android customer application.

---

## 📸 Ingestion Payload Format (Matching Hardware Specification)

The shared backend receives telemetry from ESP32 devices matching the photo format:

```json
{
  "device_id": "ESP32_001",
  "tank_id": "TANK_001",
  "distance_cm": 15.5,
  "water_depth_cm": 34.5,
  "water_level_percent": 69,
  "status": "NORMAL"
}
```

Endpoint: `POST http://localhost:5000/api/iot/readings` (Header: `x-api-key: <device-api-key>`)

---

## 📁 Repository Structure

```
HACKATHON/
├── BACKEND/                  # Shared Node.js REST API, SQLite/Supabase data layer, SSE Realtime hub
│   ├── database/
│   │   ├── migrations/
│   │   │   └── 001_initial_schema.sql  # Complete PostgreSQL / Supabase migration with RLS
│   │   └── db.js                       # Native SQLite / Supabase driver & Zambian seed data
│   ├── src/
│   │   ├── controllers/                # IoT Ingestion, Auth, Stations, Reports, Alerts, Weather
│   │   ├── middleware/                 # JWT Auth, Device Authentication, Input validation
│   │   ├── services/                   # Realtime SSE broadcast, Alert engine, Offline detector
│   │   └── server.js                   # Express server entry point
│   ├── tests/
│   │   └── iotIngestion.test.js        # Automated test suite (5/5 tests passing)
│   ├── .env.example
│   └── package.json
│
├── WEB/                      # Responsive React + Vite Administration Web Application
│   ├── src/
│   │   ├── components/                 # Sidebar, Topbar, StatCards, TankCard, MobileAppSimulator
│   │   ├── pages/                      # Dashboard, TankAnalytics (Chart.js), CommunityReports,
│   │   │                               # IncidentMap (Leaflet), AlertsCenter, HardwareSimulator
│   │   ├── context/                    # AuthContext (Admin & Customer roles)
│   │   ├── services/                   # api.js with SSE event stream subscriber
│   │   └── index.css                   # Custom Zambian civic-tech design system
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── APP/                      # Customer Mobile Application
│   ├── android/                        # Native Android Jetpack Compose + Kotlin project
│   │   ├── app/src/main/
│   │   │   ├── java/com/majismart/zambia/
│   │   │   │   ├── data/model/Models.kt            # Models matching photo contract
│   │   │   │   ├── data/remote/MajiSmartApiService.kt # Retrofit API client
│   │   │   │   ├── ui/theme/Theme.kt              # Material 3 Theme
│   │   │   │   └── MainActivity.kt                # Material 3 Navigation & Screens
│   │   │   └── AndroidManifest.xml
│   │   ├── build.gradle.kts
│   │   └── settings.gradle.kts
│   └── (Interactive Phone Preview integrated into the Web Dashboard for browser testing)
│
├── FIRMWARE/                 # ESP32 C++ Arduino Firmware & Simulator
│   ├── maji_smart_esp32/
│   │   └── maji_smart_esp32.ino        # Ultrasonic reading, calibration, LED indicators, Wi-Fi POST
│   ├── simulator/
│   │   └── iot_simulator.js            # Node CLI simulator for testing streaming and scenario presets
│   └── README.md                       # Complete wiring diagram and GPIO pinout guide
│
├── ARCHITECTURE.md           # Architecture diagrams, data flow, and telemetry specifications
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js v20+ or v24+
- (Optional for physical firmware) Arduino IDE / PlatformIO with ESP32 board support
- (Optional for Android APK) Android Studio / Android SDK 35

### 2. Run the Shared Backend
```bash
cd BACKEND
npm.cmd install
npm.cmd start
```
The backend starts on port **5000** with automatic database initialization and Zambian baseline data (Lusaka CBD, Chilenje, Matero, Chelston, Ndola).

To run the automated tests:
```bash
npm.cmd test
```

### 3. Run the Web Dashboard
In a second terminal:
```bash
cd WEB
npm.cmd install
npm.cmd run dev
```
Open **`http://localhost:3000`** in your browser.

### 4. Interactive Simulation & Verification
1. Click **"Inject Photo Reading (69%)"** in the topbar to send the exact measurement from the user's photo (`ESP32_001 -> TANK_001`).
2. Click **"Customer App"** to open the interactive mobile customer app preview, inspect synchronized water levels, and submit a community report.
3. Open **"Community Reports"** to view submitted reports and manage their lifecycle (`SUBMITTED` $\to$ `IN_PROGRESS` $\to$ `RESOLVED`).
4. Open **"Incident & Tank Map"** to inspect Leaflet-powered spatial coordinates.
5. Open **"ESP32 Simulator"** to trigger drought conditions, burst recovery, and continuous streaming.

### 5. Running the Standalone Hardware CLI Simulator
```bash
# Transmit exact reading from photo
node FIRMWARE/simulator/iot_simulator.js --mode=once

# Stream continuous tank filling / draining
node FIRMWARE/simulator/iot_simulator.js --mode=stream

# Trigger critical water alert
node FIRMWARE/simulator/iot_simulator.js --mode=critical
```

---

## 🚀 Deployment

The production topology is a Cloudflare Pages dashboard + a single always-on container for the shared API + Supabase Postgres. Full reasoning, cost tables, environment variables, and a step-by-step runbook live in **[DEPLOYMENT.md](./DEPLOYMENT.md)**. The current free-tier setup (Cloudflare Pages + Render Free + Supabase Free) is a click-by-click checklist in **[DEPLOY_FREE_TIER.md](./DEPLOY_FREE_TIER.md)**.

Short version:

- Web (`WEB/`) → Cloudflare Pages, root directory `WEB`, output `dist`, `VITE_API_BASE_URL=https://<api-host>/api`
- API (`BACKEND/`) → Render Free ([`render.yaml`](./render.yaml)), upgrade path [Fly.io](./fly.toml) / Render Starter; it needs a long-running process (device monitor + SSE), so serverless is not an option
- Database → Supabase project `majismart-zambia` (`eu-west-1`), schema in `supabase/migrations`, applied with `supabase db push` (`AUTO_MIGRATE=false` in production)
- Both clients keep pointing at the same API, so the Android app and dashboard stay in sync

Node 24 is required in CI and containers (local dev uses `node:sqlite`).

## 🔒 Security & Roles
- **Administrator and customer seed passwords** are supplied through backend environment variables and must not be committed.
- **IoT devices** authenticate through a provisioned `x-api-key` header.
- Local development uses the seeded demo accounts described by the test setup; rotate all credentials before production.
