// Weather Controller for Zambian Climate Context
// Connects to Open-Meteo with local cached fallback

let cachedWeather = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

export class WeatherController {
  static async getWeather(req, res) {
    try {
      const now = Date.now();
      if (cachedWeather && (now - lastFetchTime) < CACHE_TTL_MS) {
        return res.json({ success: true, source: 'cache', data: cachedWeather });
      }

      // Default Lusaka coordinates: -15.4167, 28.2833
      const lat = req.query.lat || -15.4167;
      const lon = req.query.lon || 28.2833;
      const city = req.query.city || 'Lusaka';

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Africa%2FLusaka`;

      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      
      if (!response.ok) {
        throw new Error(`Open-Meteo responded with status ${response.status}`);
      }

      const weatherData = await response.json();
      const current = weatherData.current;

      // Map WMO weather codes to readable descriptions
      const weatherDescriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        51: 'Light drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        80: 'Rain showers',
        95: 'Thunderstorm'
      };

      cachedWeather = {
        city,
        country: 'Zambia',
        latitude: lat,
        longitude: lon,
        temperature_c: current.temperature_2m,
        humidity_percent: current.relative_humidity_2m,
        precipitation_mm: current.precipitation,
        rain_mm: current.rain,
        wind_speed_kmh: current.wind_speed_10m,
        condition: weatherDescriptions[current.weather_code] || 'Partly cloudy',
        weather_code: current.weather_code,
        timestamp: current.time,
        daily_max_c: weatherData.daily ? weatherData.daily.temperature_2m_max[0] : current.temperature_2m + 4,
        daily_min_c: weatherData.daily ? weatherData.daily.temperature_2m_min[0] : current.temperature_2m - 6,
        is_live_external: true
      };
      lastFetchTime = now;

      return res.json({ success: true, source: 'open-meteo', data: cachedWeather });
    } catch (err) {
      console.warn('[Weather] External fetch failed, returning climate model:', err.message);
      
      // Fallback Zambian seasonal baseline
      const fallback = {
        city: 'Lusaka',
        country: 'Zambia',
        latitude: -15.4167,
        longitude: 28.2833,
        temperature_c: 26.5,
        humidity_percent: 48,
        precipitation_mm: 0.0,
        rain_mm: 0.0,
        wind_speed_kmh: 12.4,
        condition: 'Clear sky',
        weather_code: 0,
        timestamp: new Date().toISOString(),
        daily_max_c: 29.0,
        daily_min_c: 18.0,
        is_live_external: false
      };

      return res.json({ success: true, source: 'fallback', data: fallback });
    }
  }
}
