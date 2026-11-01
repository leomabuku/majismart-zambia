// Realtime Service using Server-Sent Events (SSE)
// Supports live synchronization between ESP32 ingestion, Web Dashboard, and Mobile App

class RealtimeService {
  constructor() {
    this.clients = new Set();
  }

  // Register an incoming SSE client connection
  addClient(res) {
    this.clients.add(res);

    // Initial keepalive comment
    res.write(': connected to MajiSmart Realtime Stream\n\n');
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);
    heartbeat.unref?.();

    // Remove client on connection close
    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(res);
    });
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
        this.clients.delete(client);
      }
    }
  }

  getClientCount() {
    return this.clients.size;
  }
}

export const realtime = new RealtimeService();

