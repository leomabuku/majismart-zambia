import { createClient } from '@supabase/supabase-js';
import { createReadingSource } from './readingSource';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const usesSupabaseTelemetry = Boolean(url || key);
export let telemetryConfigurationError = null;
export let telemetrySource = null;

if (usesSupabaseTelemetry) {
  try {
    if (!url || !key) throw new Error('missing configuration');
    // Prevent accidental use of privileged keys in a public build.
    if (key.startsWith('sb_secret_')) throw new Error('secret key');
    if (key.split('.').length === 3) {
      const claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role !== 'anon') throw new Error('privileged JWT');
    }
    telemetrySource = createReadingSource(createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }), { table: import.meta.env.VITE_SUPABASE_READINGS_TABLE || 'water_level_readings' });
  } catch {
    telemetryConfigurationError = 'Supabase telemetry configuration is incomplete or invalid. Use the project URL and a publishable key.';
  }
}
