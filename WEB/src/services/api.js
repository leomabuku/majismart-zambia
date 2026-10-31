// API Service for the SmartWater Zambia Web Dashboard
//
// Deployment notes (free-tier hosting):
// - The shared API runs on a free Render instance that sleeps after ~15 minutes and
//   takes 30-60s to wake, so requests are given a long timeout and one retry.
// - Server-Sent Events cannot survive a sleeping instance, so the realtime stream
//   falls back to polling and retries SSE in the background.

// Where the browser sends API calls.
//
// A build-time VITE_API_BASE_URL is preferred, but a missing or malformed value
// must never leave the deployed site calling itself: Cloudflare Pages only
// serves static files, so a relative "/api" answers every POST with 405 and the
// login form reports "Unexpected response (405)". The published Render origin is
// therefore used as the production fallback, while local dev keeps the Vite
// proxy at "/api".
const FALLBACK_API_BASE = 'https://majismart-api.onrender.com/api';

const buildBase = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalPage = !pageHost
  || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(pageHost);

const API_BASE = buildBase && (isLocalPage || buildBase.startsWith('http'))
  ? buildBase
  : (isLocalPage ? '/api' : FALLBACK_API_BASE);

if (typeof console !== 'undefined') {
  console.info('[API] base:', API_BASE, buildBase ? '(from build variable)' : '(built-in fallback)');
}

const REQUEST_TIMEOUT_MS = 70000; // covers a cold start on the free instance
const RETRY_DELAY_MS = 2500;
const POLL_INTERVAL_MS = 30000;
const SSE_RETRY_MS = 60000;

const REALTIME_EVENTS = [
  'NEW_READING',
  'TANK_UPDATED',
  'NEW_ALERT',
  'ALERT_RESOLVED',
  'ALERT_UPDATED',
  'REPORT_CREATED',
  'REPORT_STATUS_CHANGED',
  'DEVICE_STATUS_CHANGED'
];

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = {
  getToken() {
    return localStorage.getItem('majismart_token');
  },
  setToken(token) {
    if (token) localStorage.setItem('majismart_token', token);
    else localStorage.removeItem('majismart_token');
  },

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },

  /**
   * Shared request helper. Never throws: callers check `res.success`.
   * Retries once on network failure, 502/503/504 and 429, which is what a
   * waking free-tier instance usually returns.
   */
  async request(endpoint, { method = 'GET', body } = {}) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
      method,
      credentials: 'omit',
      headers: this.getHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    };

    let lastError = null;
    for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt++) {
      try {
        const res = await fetchWithTimeout(url, options);
        if (res.status === 429 || res.status >= 502) {
          lastError = { success: false, error: `API unavailable (${res.status})`, status: res.status };
        } else {
          const payload = parseJson(await res.text());
          // Carry the HTTP status so callers can tell "not signed in" (401/403)
          // apart from "API was busy" (5xx) and a network failure.
          if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            return payload.status ? payload : { ...payload, status: res.status };
          }
          if (payload) return payload;
          lastError = {
            success: false,
            error: `Unexpected response (${res.status}) from ${new URL(url, window.location.href).host}`,
            status: res.status
          };
        }
      } catch (err) {
        lastError = {
          success: false,
          error: err.name === 'AbortError' ? 'API request timed out' : 'Network error',
          detail: err.message
        };
      }
      if (attempt === 0 && method === 'GET') await sleep(RETRY_DELAY_MS);
    }
    console.warn(`[API] ${method} ${endpoint} failed:`, lastError?.error);
    return lastError || { success: false, error: 'Request failed' };
  },

  get(endpoint) {
    return this.request(endpoint);
  },

  post(endpoint, data) {
    return this.request(endpoint, { method: 'POST', body: data });
  },

  put(endpoint, data) {
    return this.request(endpoint, { method: 'PUT', body: data });
  },

  patch(endpoint, data) {
    return this.request(endpoint, { method: 'PATCH', body: data });
  },

  health() {
    return this.request('/health');
  },

  /**
   * Live updates over SSE, with an automatic polling fallback.
   *
   * @param {(event: string, data: any) => void} onMessage
   *        Event callback. When the stream is unavailable a synthetic `SYNC`
   *        event is emitted every POLL_INTERVAL_MS so the UI can refetch.
   * @param {{ onStatus?: (status: 'connecting'|'live'|'polling') => void }} options
   * @returns {() => void} unsubscribe
   */
  subscribeRealtime(onMessage, { onStatus } = {}) {
    let eventSource = null;
    let pollTimer = null;
    let retryTimer = null;
    let closed = false;
    let status = null;

    const setStatus = (next) => {
      if (status === next) return;
      status = next;
      onStatus?.(next);
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const startPolling = () => {
      if (pollTimer || closed) return;
      pollTimer = setInterval(() => {
        if (!closed) onMessage('SYNC', null);
      }, POLL_INTERVAL_MS);
    };

    const connect = () => {
      if (closed) return;
      setStatus('connecting');
      try {
        eventSource = new EventSource(`${API_BASE}/realtime/stream`);
      } catch (err) {
        console.warn('[SSE] Could not open stream:', err);
        fallback();
        return;
      }

      eventSource.onopen = () => {
        setStatus('live');
        stopPolling();
        onMessage('SYNC', null);
      };

      REALTIME_EVENTS.forEach((eventType) => {
        eventSource.addEventListener(eventType, (event) => {
          const payload = parseJson(event.data);
          if (payload) onMessage(eventType, payload.data);
        });
      });

      eventSource.onerror = () => {
        // EventSource retries every ~3s on its own, which hammers a sleeping
        // free instance. Close it, poll instead, and retry SSE later.
        fallback();
      };
    };

    const fallback = () => {
      if (closed) return;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      setStatus('polling');
      startPolling();
      if (!retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          connect();
        }, SSE_RETRY_MS);
      }
    };

    connect();

    return () => {
      closed = true;
      if (eventSource) eventSource.close();
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }
};
