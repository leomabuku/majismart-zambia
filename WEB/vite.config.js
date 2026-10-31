import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const EXPECTED_API = 'https://majismart-api.onrender.com/api';
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  if (mode === 'production') {
    if (String(env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '') !== EXPECTED_API) {
      throw new Error('Production VITE_API_BASE_URL must target the existing MajiSmart Render API');
    }
    if (Object.keys(env).some(k => /^VITE_/i.test(k) && /IOT_API_KEY|JWT_SECRET|DATABASE_URL|PASSWORD|DEVICE_KEY|SERVICE_ROLE/i.test(k))) {
      throw new Error('Private credential variable detected in the public Vite environment');
    }
  }
  return {
    plugins: [react()],
    server: {
      port: 3000, host: '0.0.0.0', allowedHosts: true,
      proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
    }
  };
});
