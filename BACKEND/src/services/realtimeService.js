// Realtime Service using Server-Sent Events (SSE)
// Supports live synchronization between ESP32 ingestion, Web Dashboard, and Mobile App
//
// Hosting note: managed proxies (Cloudflare, Fly.io, Render) drop connections that are
// silent for ~60s. A comment heartbeat keeps the stream open so browsers do not
// reconnect every minute (each reconnect is a new function invocation / request).

const HEARTBEAT_INTERVAL_MS = Number(process.env.SSE_HEARTBEAT_MS || 25000);

class RealtimeService {
  constructor() {
    this.clients = new Set();
    this.heartbeatTimer = null;
  }

  // Register an incoming SSE client connection
  addClient(res) {
    this.clients.add(res);

    // Initial keepalive comment
    res.write(': connected to MajiSmart Realtime Stream\n\n');
    this.startHeartbeat();

    // Remove client on connection close
    res.on('close', () => {
      this.removeClient(res);
    });

    res.on('error', () => {
      this.removeClient(res);
    });
  }

  removeClient(res) {
    this.clients.delete(res);
    if (this.clients.size === 0) this.stopHeartbeat();
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(`: heartbeat ${Date.now()}\n\n`);
        } catch (err) {
          console.error('[Realtime] Heartbeat failed, removing client:', err.message);
          this.removeClient(client);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    // Do not keep the process alive just for the heartbeat.
    this.heartbeatTimer.unref?.();
  }

  stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // Broadcast an event to all connected web and mobile clients
  broadcast(eventType, payload) {
    const data = JSON.stringify({
      event: eventType,
      data: payload,
      timestamp: new Date().toISOString()
    });

    for (const client of this.clients) {
      try {
        client.write(`event: ${eventType}\ndata: ${data}\n\n`);
      } catch (err) {
        console.error('[Realtime] Failed to send to client, removing:', err.message);
        this.removeClient(client);
      }
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  // Send a retry hint and close all streams (used during graceful shutdown).
  closeAll() {
    for (const client of this.clients) {
      try {
        client.write('event: SERVER_RESTART\ndata: {"event":"SERVER_RESTART"}\n\n');
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    this.stopHeartbeat();
  }
}

export const realtime = new RealtimeService();
