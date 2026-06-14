import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useTraceEngine } from '../engine/useTraceEngine';

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
  isPlaying: false,
  playbackSpeed: 1,
  detectedBugs: [],
  detectedAlgorithm: null,

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

  // Settings
  customApiKey: (typeof localStorage !== 'undefined' && localStorage.getItem('algolens-apikey')) || '',
  judge0ApiKey: (typeof localStorage !== 'undefined' && localStorage.getItem('algolens-judge0-apikey')) || '',
};

// ============================================================
// PROVIDER
// ============================================================
export function AppProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);

  const update = useCallback((patchOrFn) => {
    setState((prev) => {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(prev) : patchOrFn;
      return { ...prev, ...patch };
    });
  }, []);

  const traceEngine = useTraceEngine();

  // Auto-init trace engine on boot
  useEffect(() => {
    traceEngine.initEngine();
  }, [traceEngine.initEngine]);

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
  }, [state.code, state.language]);

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
    <AppContext.Provider value={{ state, update, traceEngine }}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
