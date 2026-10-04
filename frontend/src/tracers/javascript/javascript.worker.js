/* Runs instrumented JavaScript off the main thread. */
import { runJs, inspectJs } from './run.js';

// The program being traced is the user's own, but it has no business talking to the network
// or storage from inside our worker. Best-effort hardening on top of the worker sandbox.
for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'indexedDB', 'caches', 'importScripts']) {
  try {
    Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
  } catch {
    /* already locked down */
  }
}

const post = (message) => self.postMessage(message);

self.onmessage = ({ data }) => {
  const { type, id, payload } = data;
  try {
    let result = true;
    if (type === 'run') result = runJs(payload.job);
    else if (type === 'inspect') result = inspectJs(payload.code);
    post({ type: 'result', id, result });
  } catch (error) {
    post({ type: 'error', id, error: error?.message || String(error) });
  }
};
