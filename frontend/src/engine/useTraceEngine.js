import { useState, useRef, useCallback, useEffect } from 'react';
import { WORKER_SOURCE } from './workerSource';
import { PYTHON_TRACER } from './pythonCode';

// ============================================================
// ENGINE STATUS
// ============================================================
// 'idle'       — worker not created yet
// 'loading'    — Pyodide downloading / initialising
// 'ready'      — engine ready to execute
// 'executing'  — running user code
// 'error'      — unrecoverable worker error

// ============================================================
// WORKER MANAGER (singleton-ish — one worker per hook instance)
// ============================================================

let msgIdCounter = 0;

function createBlobWorker() {
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  const url  = URL.createObjectURL(blob);
  const w    = new Worker(url);
  // Revoke the URL immediately — the worker stays alive
  URL.revokeObjectURL(url);
  return w;
}

// ============================================================
// useTraceEngine HOOK
// ============================================================
export function useTraceEngine() {
  const [engineStatus, setEngineStatus]   = useState('idle');
  const [engineMessage, setEngineMessage] = useState('');
  const [error, setError]                 = useState(null);

  const workerRef   = useRef(null);
  const pendingRef  = useRef(new Map()); // msgId → { resolve, reject, timeoutId }

  // ── Send a message and await a typed response ──────────────
  const sendMsg = useCallback((type, payload, timeoutMs = 30000) => {
    return new Promise((resolve, reject) => {
      const id        = ++msgIdCounter;
      const timeoutId = setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error(`Worker timed out (${type}, ${timeoutMs}ms)`));
      }, timeoutMs);

      pendingRef.current.set(id, { resolve, reject, timeoutId });
      workerRef.current.postMessage({ type, id, payload });
    });
  }, []);

  // ── Bootstrap worker and wire message handler ─────────────
  const bootWorker = useCallback(() => {
    if (workerRef.current) return;

    const w = createBlobWorker();
    workerRef.current = w;

    w.onmessage = (e) => {
      const { type, id, data, error: workerErr, message } = e.data;

      // PROGRESS is a fire-and-forget broadcast
      if (type === 'PROGRESS') {
        setEngineMessage(message);
        return;
      }

      const pending = pendingRef.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timeoutId);
      pendingRef.current.delete(id);

      if (type === 'ERROR') {
        pending.reject(new Error(workerErr || 'Unknown worker error'));
      } else {
        pending.resolve(data);
      }
    };

    w.onerror = (e) => {
      setError('Worker crashed: ' + e.message);
      setEngineStatus('error');
      // Reject all pending
      for (const [, p] of pendingRef.current) {
        clearTimeout(p.timeoutId);
        p.reject(new Error('Worker crashed'));
      }
      pendingRef.current.clear();
      workerRef.current = null;
    };
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // ── initEngine ────────────────────────────────────────────
  // Creates the worker (if needed) and loads Pyodide + tracer.
  // Safe to call multiple times — skips if already ready.
  const initEngine = useCallback(async () => {
    if (engineStatus === 'ready') return;
    if (engineStatus === 'loading') return;

    setEngineStatus('loading');
    setError(null);

    try {
      bootWorker();
      // SETUP: load Pyodide + define algolens_run
      // 60 second timeout — CDN can be slow first time
      await sendMsg('SETUP', { pythonCode: PYTHON_TRACER }, 60000);
      setEngineStatus('ready');
      setEngineMessage('');
    } catch (err) {
      setError(err.message);
      setEngineStatus('error');
    }
  }, [engineStatus, bootWorker, sendMsg]);

  // ── executeCode ───────────────────────────────────────────
  // Sends code + testInput to the worker and returns the parsed
  // { frames, bugs, error, result } object.
  const executeCode = useCallback(async (editorMode, language, code, testInput, apiKey, judge0ApiKey) => {
    setEngineStatus('executing');
    setError(null);
    try {
      const res = await fetch('http://localhost:3000/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editorMode, language, code, testInput: JSON.parse(testInput || '[]'), apiKey, judge0ApiKey })
      });
      const result = await res.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setEngineStatus('ready');
    }
  }, [engineStatus]);

  // ── resetEngine ───────────────────────────────────────────
  // Terminates the crashed worker and resets state.
  const resetEngine = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    pendingRef.current.clear();
    setEngineStatus('idle');
    setError(null);
    setEngineMessage('');
  }, []);

  return {
    initEngine,
    executeCode,
    resetEngine,
    isReady:     engineStatus === 'ready',
    isLoading:   engineStatus === 'loading',
    isExecuting: engineStatus === 'executing',
    engineStatus,
    engineMessage,
    error,
  };
}
