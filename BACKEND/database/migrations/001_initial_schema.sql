-- ==============================================================================
-- DEPRECATED COPY - do not edit.
-- The canonical schema is supabase/migrations/20261024000001_initial_schema.sql
-- (applied by `supabase db push` and read by BACKEND/src/database/db.js).
-- This file has drifted from the canonical copy and is kept only for reference.
-- See DEPLOYMENT.md section 4.2.
-- ==============================================================================

-- ==============================================================================
-- MAJISMART ZAMBIA: PostgreSQL & Supabase Database Migration
-- Version: 001_initial_schema.sql
-- Description: Core schema for IoT water monitoring, alerting & community reports
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PROFILES & ROLES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer', 'technician')),
    phone_number VARCHAR(50),
    community VARCHAR(100),
    district VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for profile lookup
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ==============================================================================
-- 2. MONITORING STATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.monitoring_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    community VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL DEFAULT 'Lusaka',
    province VARCHAR(100) NOT NULL DEFAULT 'Lusaka Province',
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'INACTIVE')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stations_code ON public.monitoring_stations(code);
CREATE INDEX IF NOT EXISTS idx_stations_status ON public.monitoring_stations(status);

-- ==============================================================================
-- 3. TANKS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tanks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'TANK_001' from photo
    station_id UUID REFERENCES public.monitoring_stations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    total_height_cm NUMERIC(8, 2) NOT NULL DEFAULT 200.0,
    usable_height_cm NUMERIC(8, 2) NOT NULL DEFAULT 180.0,
    sensor_offset_cm NUMERIC(8, 2) NOT NULL DEFAULT 20.0, -- Distance from sensor to max fill level
    capacity_liters INTEGER NOT NULL DEFAULT 10000,
    low_threshold_percent NUMERIC(5, 2) NOT NULL DEFAULT 25.0,
    critical_threshold_percent NUMERIC(5, 2) NOT NULL DEFAULT 10.0,
    recovery_threshold_percent NUMERIC(5, 2) NOT NULL DEFAULT 35.0,
    current_water_depth_cm NUMERIC(8, 2) DEFAULT 0.0,
    current_water_percent NUMERIC(5, 2) DEFAULT 0.0,
    current_status VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (current_status IN ('NORMAL', 'LOW', 'CRITICAL', 'OFFLINE', 'SENSOR_ERROR')),
    last_reading_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tanks_code ON public.tanks(tank_id_code);
CREATE INDEX IF NOT EXISTS idx_tanks_station ON public.tanks(station_id);
CREATE INDEX IF NOT EXISTS idx_tanks_status ON public.tanks(current_status);

-- ==============================================================================
-- 4. MONITORING DEVICES (IoT ESP32)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.monitoring_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'ESP32_001' from photo
    tank_id UUID REFERENCES public.tanks(id) ON DELETE SET NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    firmware_version VARCHAR(50) DEFAULT 'v1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    ip_address VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_code ON public.monitoring_devices(device_id_code);
CREATE INDEX IF NOT EXISTS idx_devices_tank ON public.monitoring_devices(tank_id);

-- ==============================================================================
-- 5. WATER LEVEL READINGS (Ingestion History matching Photo format)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.water_level_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id VARCHAR(50) NOT NULL,
    tank_id VARCHAR(50) NOT NULL,
    distance_cm NUMERIC(8, 2) NOT NULL,
    water_depth_cm NUMERIC(8, 2) NOT NULL,
    water_level_percent NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('NORMAL', 'LOW', 'CRITICAL', 'SENSOR_ERROR')),
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_tank_time ON public.water_level_readings(tank_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_device_time ON public.water_level_readings(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_created_at ON public.water_level_readings(created_at DESC);

-- ==============================================================================
-- 6. WATER ALERTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.water_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id UUID REFERENCES public.tanks(id) ON DELETE CASCADE,
    device_id VARCHAR(50),
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('LOW_WATER', 'CRITICAL_WATER', 'DEVICE_OFFLINE', 'SENSOR_ERROR', 'WATER_RECOVERED')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED')),
    acknowledged_by UUID REFERENCES public.profiles(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_tank ON public.water_alerts(tank_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON public.water_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON public.water_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.water_alerts(created_at DESC);

-- ==============================================================================
-- 7. COMMUNITY REPORTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'WATER_SHORTAGE',
        'PIPE_LEAKAGE',
        'BURST_PIPE',
        'TANK_MALFUNCTION',
        'WATER_QUALITY',
        'OTHER'
    )),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    station_id UUID REFERENCES public.monitoring_stations(id) ON DELETE SET NULL,
    image_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (
        'SUBMITTED',
        'ACKNOWLEDGED',
        'IN_PROGRESS',
        'RESOLVED',
        'REJECTED'
    )),
    admin_notes TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.community_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_category ON public.community_reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.community_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_station ON public.community_reports(station_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.community_reports(created_at DESC);

-- ==============================================================================
-- 8. REPORT STATUS HISTORY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.report_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.community_reports(id) ON DELETE CASCADE,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_report ON public.report_status_history(report_id);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON public.report_status_history(created_at ASC);

-- ==============================================================================
-- 9. SYSTEM SETTINGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_level_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: Is Admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Public read profiles summary or own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update their own non-role profile fields"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Monitoring Stations Policies (Read public/authenticated, write admin only)
CREATE POLICY "Anyone can view active stations"
    ON public.monitoring_stations FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage stations"
    ON public.monitoring_stations FOR ALL
    USING (public.is_admin());

-- Tanks Policies
CREATE POLICY "Anyone can view tanks"
    ON public.tanks FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage tanks"
    ON public.tanks FOR ALL
    USING (public.is_admin());

-- Water Level Readings
CREATE POLICY "Anyone can view readings"
    ON public.water_level_readings FOR SELECT
    USING (true);

-- Devices
CREATE POLICY "Admins can view and manage devices"
    ON public.monitoring_devices FOR ALL
    USING (public.is_admin());

-- Alerts
CREATE POLICY "Anyone can view alerts"
    ON public.water_alerts FOR SELECT
    USING (true);

CREATE POLICY "Admins can acknowledge/resolve alerts"
    ON public.water_alerts FOR UPDATE
    USING (public.is_admin());

-- Community Reports Policies
CREATE POLICY "Reporters can view their own reports and public can view non-rejected reports"
    ON public.community_reports FOR SELECT
    USING (auth.uid() = reporter_id OR public.is_admin() OR status != 'REJECTED');

CREATE POLICY "Authenticated users can submit reports"
    ON public.community_reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Only admins can update report status and admin notes"
    ON public.community_reports FOR UPDATE
    USING (public.is_admin());

-- Report Status History
CREATE POLICY "Users can view history of permitted reports"
    ON public.report_status_history FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.community_reports r
        WHERE r.id = report_status_history.report_id
        AND (r.reporter_id = auth.uid() OR public.is_admin() OR r.status != 'REJECTED')
    ));

CREATE POLICY "Admins can insert status history"
    ON public.report_status_history FOR INSERT
    WITH CHECK (public.is_admin());
