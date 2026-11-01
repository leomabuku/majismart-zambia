// Coalesce duplicate invalidations and serialize reads. A newer event received
// during a fetch always gets a catch-up fetch rather than being dropped.
export function createRefreshQueue(work, onError = () => {}) {
  let closed = false;
  let pending = false;
  let running = null;
  return {
    request() {
      if (closed) return Promise.resolve();
      pending = true;
      if (!running) running = (async () => {
        while (pending && !closed) {
          pending = false;
          try { await work(); } catch (error) { onError(error); }
        }
      })().finally(() => { running = null; });
      return running;
    },
    close() { closed = true; pending = false; }
  };
}
