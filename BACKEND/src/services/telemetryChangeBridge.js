// Relay out-of-process database writes as invalidations, never as public row data.
// The browser then fetches the current records through the existing authorized API.
export class TelemetryChangeBridge {
  constructor({ client, readState, onChange, hasViewers = () => true, pollMs = 2000 }) {
    this.client = client;
    this.readState = readState;
    this.onChange = onChange;
    this.hasViewers = hasViewers;
    this.pollMs = Number.isFinite(pollMs) ? Math.max(1000, pollMs) : 2000;
    this.running = false;
    this.polling = false;
    this.fingerprint = null;
    this.state = { mode: 'stopped', last_event_at: null, last_check_at: null, check_error: false };
  }

  status() { return { ...this.state }; }

  notify() {
    if (!this.running) return;
    this.state.last_event_at = new Date().toISOString();
    this.onChange();
  }

  async check() {
    if (!this.running || this.polling || !this.hasViewers()) return;
    this.polling = true;
    try {
      const rows = await this.readState();
      if (!this.running) return;
      const fingerprint = JSON.stringify(rows);
      const changed = this.fingerprint !== null && fingerprint !== this.fingerprint;
      this.fingerprint = fingerprint;
      this.state.last_check_at = new Date().toISOString();
      this.state.check_error = false;
      if (changed) this.notify();
    } catch {
      // Keep serving API-originated SSE events during a database/realtime outage.
      if (this.running) this.state.check_error = true;
    } finally { this.polling = false; }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.state.mode = 'database-fallback';
    // Retain this check even when a channel joins: a joined channel alone does
    // not prove the table was published or that a database event was delivered.
    void this.check();
    this.timer = setInterval(() => { void this.check(); }, this.pollMs);
    this.timer.unref?.();
    if (!this.client) return;
    try {
      this.channel = this.client.channel('api-telemetry-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'water_level_readings' }, () => this.notify())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tanks' }, () => this.notify())
        .subscribe(status => {
          if (!this.running) return;
          this.state.mode = status === 'SUBSCRIBED' ? 'supabase-realtime-with-fallback' : 'database-fallback';
          if (status === 'SUBSCRIBED') this.notify(); // Catch up after reconnect.
        });
    } catch {
      this.state.mode = 'database-fallback';
    }
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    this.state.mode = 'stopped';
    if (this.channel) {
      await this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
