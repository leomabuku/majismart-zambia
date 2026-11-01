// API Service for MajiSmart Zambia Web Dashboard

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

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

  async get(endpoint, { signal } = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, { credentials: 'omit', headers: this.getHeaders(), signal });
    return res.json();
  },

  async post(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      credentials: 'omit',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async put(endpoint, data) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      credentials: 'omit',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  subscribeRealtime(onMessage, onStatus = () => {}) {
    const eventSource = new EventSource(`${API_BASE}/realtime/stream`);
    eventSource.onopen = () => onStatus(true);
    const eventTypes = [
      'NEW_READING',
      'TANK_UPDATED',
      'NEW_ALERT',
      'ALERT_RESOLVED',
      'ALERT_UPDATED',
      'REPORT_CREATED',
      'REPORT_STATUS_CHANGED',
      'DEVICE_STATUS_CHANGED'
    ];

    eventTypes.forEach((eventType) => {
      eventSource.addEventListener(eventType, (event) => {
        onMessage(eventType, JSON.parse(event.data).data);
      });
    });

    eventSource.onerror = (err) => {
      onStatus(false);
      console.warn('[SSE] Reconnecting to realtime stream...', err);
    };

    return () => { eventSource.close(); };
  }
};

