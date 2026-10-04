/**
 * Small promise-RPC wrapper around a Web Worker.
 *
 * - The worker is created lazily and booted once with an `init` message.
 * - Every call has a timeout. On timeout the worker is *terminated* (the only way to stop a
 *   runaway program inside it) and transparently re-created on the next call.
 *
 * Worker protocol: main -> {type, id, payload}   worker -> {type:'result'|'error'|'progress', id, ...}
 */
export class WorkerTimeoutError extends Error {
  constructor(seconds) {
    super(`The program ran for more than ${seconds}s and was stopped.`);
    this.name = 'WorkerTimeoutError';
  }
}

export function createWorkerClient({ createWorker, initPayload = () => ({}), initTimeoutMs = 90_000 }) {
  let worker = null;
  let ready = null;
  let seq = 0;
  const pending = new Map();
  const progressListeners = new Set();

  const rejectAll = (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };

  const reset = () => {
    worker?.terminate();
    worker = null;
    ready = null;
  };

  const spawn = () => {
    worker = createWorker();
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        progressListeners.forEach((fn) => fn(data.message));
        return;
      }
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      clearTimeout(p.timer);
      if (data.type === 'error') p.reject(new Error(data.error));
      else p.resolve(data.result);
    };
    worker.onerror = (event) => {
      rejectAll(new Error(event.message || 'The runtime crashed.'));
      reset();
    };
  };

  const send = (type, payload, timeoutMs) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reset(); // kills whatever the worker is still doing
        reject(type === 'init' ? new Error('The runtime took too long to load.') : new WorkerTimeoutError(Math.round(timeoutMs / 1000)));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type, id, payload });
    });

  const ensure = () => {
    if (!ready) {
      if (!worker) spawn();
      ready = send('init', initPayload(), initTimeoutMs).catch((err) => {
        reset();
        throw err;
      });
    }
    return ready;
  };

  return {
    ensure,
    async call(type, payload, timeoutMs = 30_000) {
      await ensure();
      return send(type, payload, timeoutMs);
    },
    onProgress(fn) {
      progressListeners.add(fn);
      return () => progressListeners.delete(fn);
    },
    terminate: reset,
    isReady: () => ready !== null && worker !== null,
  };
}
