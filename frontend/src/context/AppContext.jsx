import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTraceEngine } from '../engine/useTraceEngine';
import { getGroqKey } from '../api/client';
import { buildOutline, planVisible, stepFrame, foldsToReveal } from '../core/beats';

// ============================================================
// CONTEXT SHAPE
// ============================================================
const AppContext = createContext(null);

const savedCodeByLang = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem('algolens-codeByLanguage');
    return raw ? JSON.parse(raw) : { python: '', java: '', cpp: '', javascript: '' };
  } catch { return { python: '', java: '', cpp: '', javascript: '' }; }
})();

const savedSession = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem('algolens-session');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
})();

const INITIAL_STATE = {
  // Navigation
  view: 'editor',            // 'editor' | 'visualizer'

  // Session
  editorMode: savedSession.editorMode || 'custom',      // 'custom' | 'leetcode'
  leetcodeProblem: savedSession.leetcodeProblem || null,
  isLeetcodeModalOpen: false,
  language: 'python',
  code: savedCodeByLang.python || '',
  codeByLanguage: savedCodeByLang,
  testInput: '',
  customInputs: savedSession.customInputs || [{ key: 'nums', val: '[1, 2, 3, 4, 5]' }],
  lastExecutedCode: '',

  // Execution
  isRunning: false,
  globalLoading: false,
  globalLoadingText: '',
  executionTrace: [],
  currentFrame: 0,
  executionResult: null,
  traceStdout: '',          // everything the program printed (frames carry outLen to slice it)
  traceMeta: null,
  isPlaying: false,
  playbackSpeed: 1,
  detectedBugs: [],
  detectedAlgorithm: null,

  // Beats: how much of the trace is shown step by step ('auto' folds only long traces)
  detail: 'auto',           // 'auto' | 'overview' | 'full'
  expandedFolds: [],        // ids of folded iteration runs the user opened

  // Entry point ("Run as") - candidates come from the tracer's inspect()
  entryChoice: 'auto',      // 'auto' | 'script' | 'Class.method'
  entryCandidates: [],
  scriptLike: false,
  stdin: '',

  // Diff Debugger
  diffMode: false,
  traceA: null,
  traceB: null,
  diffFrameIndex: 0,
  diffReport: '',

  // UI
  theme: (typeof localStorage !== 'undefined' && localStorage.getItem('algolens-theme')) || 'light',

  // Visualizer floating panels
  leftPanelOpen: true,
  rightPanelOpen: true,
  isAiAssistantOpen: false,

  // Settings (the Groq key itself lives in api/client.js; this only mirrors "is one set?")
  hasApiKey: Boolean(getGroqKey()),
};

// ============================================================
// PROVIDER
// ============================================================
export function AppProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);

  const update = useCallback((patchOrFn) => {
    setState((prev) => {
      let patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      // a new trace starts with every fold closed (fold ids are only meaningful per trace)
      if (patch.executionTrace !== undefined && patch.expandedFolds === undefined) {
        patch = { ...patch, expandedFolds: [] };
      }
      return { ...prev, ...patch };
    });
  }, []);

  // ── Beats: outline of the trace + which parts are shown step by step ──────────────────
  const outlineSource = state.lastExecutedCode || state.code;
  const outline = useMemo(
    () => buildOutline(state.executionTrace, outlineSource),
    [state.executionTrace, outlineSource],
  );
  const bugFrames = useMemo(() => state.detectedBugs.map((b) => b.frameId), [state.detectedBugs]);
  const items = useMemo(
    () => planVisible(outline, {
      detail: state.detail,
      expanded: new Set(state.expandedFolds),
      bugFrames,
      total: state.executionTrace.length,
    }),
    [outline, state.detail, state.expandedFolds, bugFrames, state.executionTrace.length],
  );
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  /** Move `delta` beats. Folded runs count as one beat (they land on the state after the run). */
  const stepBy = useCallback((delta, { keepPlaying = false } = {}) => {
    update((prev) => ({
      currentFrame: stepFrame(itemsRef.current, prev.currentFrame, delta),
      ...(keepPlaying ? {} : { isPlaying: false }),
    }));
  }, [update]);

  /** Jump to any recorded frame, opening whatever fold hides it. */
  const goToFrame = useCallback((index) => {
    update((prev) => {
      const expanded = new Set(prev.expandedFolds);
      let plan = itemsRef.current;
      for (let guard = 0; guard < 12; guard += 1) {
        const reveal = foldsToReveal(plan, index).filter((id) => !expanded.has(id));
        if (reveal.length === 0) break;
        reveal.forEach((id) => expanded.add(id));
        plan = planVisible(outline, { detail: prev.detail, expanded, bugFrames, total: prev.executionTrace.length });
      }
      return { currentFrame: index, isPlaying: false, expandedFolds: [...expanded] };
    });
  }, [update, outline, bugFrames]);

  /** One playback tick: next beat, or stop at the end. */
  const advance = useCallback(() => {
    update((prev) => {
      const next = stepFrame(itemsRef.current, prev.currentFrame, 1);
      return next === prev.currentFrame ? { isPlaying: false } : { currentFrame: next };
    });
  }, [update]);

  const beats = useMemo(
    () => ({ items, outline, stepBy, goToFrame, advance }),
    [items, outline, stepBy, goToFrame, advance],
  );

  const traceEngine = useTraceEngine();

  // Warm the runtime for the selected language in the background (never blocks the UI), so the
  // first Run does not have to wait for the download.
  const { prepare } = traceEngine;
  useEffect(() => {
    const id = setTimeout(() => prepare(state.language).catch(() => {}), 400);
    return () => clearTimeout(id);
  }, [state.language, prepare]);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', state.theme === 'dark');
    localStorage.setItem('algolens-theme', state.theme);
  }, [state.theme]);

  // Collapse floating panels on narrow screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e) => {
      if (e.matches) update({ leftPanelOpen: false, rightPanelOpen: false });
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [update]);

  // Persist code per language to localStorage
  useEffect(() => {
    const updated = { ...state.codeByLanguage, [state.language]: state.code };
    localStorage.setItem('algolens-codeByLanguage', JSON.stringify(updated));
  }, [state.code, state.language, state.codeByLanguage]);

  // Persist session to localStorage
  useEffect(() => {
    const sessionData = {
      editorMode: state.editorMode,
      leetcodeProblem: state.leetcodeProblem,
      customInputs: state.customInputs
    };
    localStorage.setItem('algolens-session', JSON.stringify(sessionData));
  }, [state.editorMode, state.leetcodeProblem, state.customInputs]);

  return (
    <AppContext.Provider value={{ state, update, traceEngine, beats }}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================
// eslint-disable-next-line react-refresh/only-export-components -- the hook lives next to its provider on purpose
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
