import { useState, useCallback, useRef, useEffect } from 'react';
import { getTracer } from '../tracers';
import { buildJob } from './buildJob';

/**
 * Thin React wrapper over the tracer registry.
 *
 * engineStatus: 'idle' | 'loading' (runtime downloading) | 'ready' | 'executing' | 'error'
 * Runtimes load lazily, the first time a language is actually needed - the app is usable
 * immediately and never waits on a runtime it does not use.
 */
export function useTraceEngine() {
  const [engineStatus, setStatus] = useState('idle');
  const [engineMessage, setMessage] = useState('');
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);
  const safe = (fn) => { if (mounted.current) fn(); };

  const prepare = useCallback(async (language) => {
    const tracer = getTracer(language);
    if (!tracer || tracer.isReady()) return;
    if (!busy.current) safe(() => { setStatus('loading'); setMessage(`Loading ${tracer.label} runtime…`); });
    const off = tracer.onProgress?.((m) => safe(() => setMessage(m)));
    try {
      await tracer.prepare();
      if (!busy.current) safe(() => { setStatus('ready'); setMessage(''); });
    } catch (err) {
      safe(() => { setError(err.message); setStatus('error'); });
      throw err;
    } finally {
      off?.();
    }
  }, []);

  /** Runs the code for real and resolves with the built trace ({frames, bugs, stdout, result, ...}). */
  const run = useCallback(async (state) => {
    const tracer = getTracer(state.language);
    if (!tracer) throw new Error(`Unsupported language: ${state.language}`);
    busy.current = true;
    safe(() => { setError(null); setStatus('executing'); });
    try {
      await prepare(state.language);
      const job = await buildJob(state, tracer);
      // sandboxed languages report what they are doing (downloading the runner, compiling ...)
      const off = tracer.onProgress?.((m) => safe(() => setMessage(m)));
      try {
        return await tracer.trace(job);
      } finally {
        off?.();
      }
    } catch (err) {
      safe(() => setError(err.message));
      throw err;
    } finally {
      busy.current = false;
      safe(() => { setStatus('ready'); setMessage(''); });
    }
  }, [prepare]);

  const inspect = useCallback(async (language, code) => {
    const tracer = getTracer(language);
    if (!tracer) return { entries: [], scriptLike: false };
    await prepare(language);
    return tracer.inspect(code);
  }, [prepare]);

  const resetEngine = useCallback(() => {
    safe(() => { setStatus('idle'); setError(null); setMessage(''); });
  }, []);

  return {
    prepare, run, inspect, resetEngine,
    isReady: engineStatus === 'ready',
    isLoading: engineStatus === 'loading',
    isExecuting: engineStatus === 'executing',
    engineStatus, engineMessage, error,
  };
}
