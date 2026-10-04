import { useCallback, useEffect, useRef, useState } from 'react';
import { explainRun } from './story.js';

const IDLE = { phase: 'idle', story: null, error: '', dropped: null, cached: false };

/**
 * State of "Explain this run" for one trace: idle until the person presses the button, then one request.
 * A new trace (or leaving the page) cancels a request in flight and forgets the story, because marks only
 * make sense for the run they were made for.
 */
export function useStory({ trace, model, code, language, problem, result, runId }) {
  const [state, setState] = useState({ trace: null, ...IDLE });
  const abortRef = useRef(null);
  const live = state.trace === trace ? state : { trace, ...IDLE };

  useEffect(() => { abortRef.current?.abort(); }, [trace]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const explain = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ trace, ...IDLE, phase: 'loading' });
    try {
      const out = await explainRun({ model, code, language, problem, result, runId, signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({ trace, phase: 'ready', story: out.story, error: '', dropped: out.dropped, cached: out.cached });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      setState({ trace, ...IDLE, phase: 'error', error: error.message || 'Could not explain this run.' });
    }
  }, [trace, model, code, language, problem, result, runId]);

  const dismiss = useCallback(() => setState({ trace, ...IDLE }), [trace]);

  return { ...live, explain, dismiss };
}
