import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Wand2, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { argsFromInputs, entryLabel } from '../engine/buildJob';
import { EDGE_THEMES, edgeCase } from '../engine/edgeCases';

/** The parameters a run would be called with: LeetCode's signature, else the chosen function, else whatever is typed in. */
function parametersOf(state) {
  const signature = state.editorMode === 'leetcode' ? state.leetcodeProblem?.signature?.params : null;
  if (signature?.length) return signature;
  if (state.entryChoice !== 'script') {
    const candidates = state.entryCandidates || [];
    const chosen = state.entryChoice === 'auto' ? candidates[0] : candidates.find((c) => entryLabel(c) === state.entryChoice);
    if (chosen?.params?.length) return chosen.params;
  }
  return Object.keys(argsFromInputs(state.customInputs)).map((name) => ({ name, type: null }));
}

export default function TestcaseLab() {
  const { state, update, traceEngine } = useApp();
  const [customCases, setCustomCases] = useState([]);
  const [runningId, setRunningId] = useState(null);

  const params = useMemo(() => parametersOf(state), [state]);
  const sample = useMemo(() => argsFromInputs(state.customInputs), [state.customInputs]);
  const skipped = useMemo(() => edgeCase('single', params, { sample }).unknown, [params, sample]);

  const seeds = useRef(0); // each click gets a new seed, so "Random" differs every time yet a session is reproducible
  const addEdgeCases = (themeIds) => {
    const seed = (seeds.current += 1);
    setCustomCases((prev) => [
      ...prev,
      ...themeIds.map((id, i) => {
        const made = edgeCase(id, params, { sample, seed });
        return { id: `${made.id}-${prev.length + i}`, source: 'user', data: made.data, label: `Edge: ${made.label}`, editable: false };
      }),
    ]);
  };

  // Build the list of test cases from LeetCode or custom inputs
  const sampleCases = useMemo(() => {
    if (state.editorMode === 'leetcode' && state.leetcodeProblem?.testcases) {
      return state.leetcodeProblem.testcases.map((tc, i) => ({
        id: `lc-${i}`,
        source: 'leetcode',
        data: typeof tc === 'object' ? tc : { input: tc },
        label: `Sample ${i + 1}`,
      }));
    }
    // For custom mode, show current customInputs as a single test case
    if (state.customInputs && state.customInputs.length > 0) {
      const obj = {};
      state.customInputs.forEach(inp => {
        if (inp.key) {
          try { obj[inp.key] = JSON.parse(inp.val); }
          catch { obj[inp.key] = inp.val; }
        }
      });
      if (Object.keys(obj).length > 0) {
        return [{ id: 'custom-current', source: 'custom', data: obj, label: 'Current Input' }];
      }
    }
    return [];
  }, [state.editorMode, state.leetcodeProblem, state.customInputs]);

  const allCases = [...sampleCases, ...customCases];

  const addCustomCase = () => {
    setCustomCases(prev => [...prev, {
      id: `user-${Date.now()}`,
      source: 'user',
      data: {},
      label: `Custom ${prev.length + 1}`,
      editable: true,
      inputStr: '',
    }]);
  };

  const removeCustomCase = (id) => {
    setCustomCases(prev => prev.filter(c => c.id !== id));
  };

  const updateCustomCaseInput = (id, val) => {
    setCustomCases(prev => prev.map(c => {
      if (c.id !== id) return c;
      let data = {};
      const lines = val.split('\n');
      for (const line of lines) {
        const idx = line.indexOf('=');
        if (idx > -1) {
          const k = line.substring(0, idx).trim();
          const vStr = line.substring(idx + 1).trim();
          if (k) {
            try { data[k] = JSON.parse(vStr); }
            catch { data[k] = vStr; }
          }
        }
      }
      return { ...c, inputStr: val, data };
    }));
  };

  const handleReRun = async (testCase) => {
    setRunningId(testCase.id);
    update({ globalLoading: true, globalLoadingText: 'Re-running with selected test case…' });

    try {
      const inputs = Object.entries(testCase.data).map(([key, value]) => ({ key, val: JSON.stringify(value) }));
      const built = await traceEngine.run({ ...state, customInputs: inputs });

      if (built.frames.length === 0) {
        alert('Error: ' + (built.error ? `${built.error.type}: ${built.error.message}` : 'nothing was executed'));
        update({ globalLoading: false });
        return;
      }

      update({
        globalLoading: false,
        executionTrace: built.frames,
        currentFrame: 0,
        detectedBugs: built.bugs,
        lastExecutedCode: state.code || '',
        executionResult: built.result,
        traceStdout: built.stdout,
        traceMeta: built.meta,
        customInputs: inputs,
      });
    } catch (err) {
      alert('Execution failed: ' + err.message);
      update({ globalLoading: false });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Test Cases</h2>
        <button onClick={addCustomCase} style={{
          padding: '4px 10px', background: 'transparent', border: '1px solid var(--accent-sage)',
          color: 'var(--accent-sage)', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4
        }}>
          <Plus size={12} /> Add Case
        </button>
      </div>

      {/* Source badge */}
      {state.editorMode === 'leetcode' && state.leetcodeProblem && (
        <div style={{
          padding: '6px 10px', background: 'rgba(143,175,157,0.08)',
          border: '1px solid rgba(143,175,157,0.2)', borderRadius: 6,
          fontSize: 11, color: 'var(--accent-sage)', fontWeight: 500,
        }}>
          Showing {sampleCases.length} sample case{sampleCases.length !== 1 ? 's' : ''} from LeetCode
        </div>
      )}

      {/* Test case cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {allCases.map((tc) => (
          <div key={tc.id} style={{
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: 14,
            display: 'flex', flexDirection: 'column', gap: 8,
            transition: 'border-color 200ms ease',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tc.label}</span>
                <span style={{
                  padding: '1px 6px', borderRadius: 12, fontSize: 9, fontWeight: 600,
                  background: tc.source === 'leetcode' ? 'rgba(255,160,0,0.12)' : tc.source === 'custom' ? 'rgba(143,175,157,0.12)' : 'rgba(126,184,212,0.12)',
                  color: tc.source === 'leetcode' ? '#E07D00' : tc.source === 'custom' ? 'var(--accent-sage)' : '#1E6480',
                  textTransform: 'uppercase',
                }}>
                  {tc.source}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => handleReRun(tc)}
                  disabled={runningId === tc.id}
                  title="Re-run with this test case"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', background: 'var(--accent-sage)', color: '#fff',
                    border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 600,
                    cursor: runningId === tc.id ? 'not-allowed' : 'pointer',
                    opacity: runningId === tc.id ? 0.6 : 1,
                  }}
                >
                  {runningId === tc.id ? (
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      animation: 'spin 600ms linear infinite',
                      display: 'inline-block',
                    }} />
                  ) : (
                    <RefreshCw size={10} />
                  )}
                  Re-run
                </button>
                {tc.source === 'user' && (
                  <button onClick={() => removeCustomCase(tc.id)} style={{
                    background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2
                  }}><Trash2 size={14} /></button>
                )}
              </div>
            </div>

            {/* Key-value pairs */}
            {tc.source === 'user' && tc.editable ? (
              <textarea
                value={tc.inputStr || ''}
                onChange={(e) => updateCustomCaseInput(tc.id, e.target.value)}
                placeholder="nums=[1,2,3]&#10;target=5"
                rows={2}
                style={{
                  width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '8px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  resize: 'vertical', outline: 'none',
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(tc.data).map(([key, val]) => (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '6px 10px', background: 'var(--bg-card)',
                    border: '1px solid var(--border)', borderRadius: 6,
                  }}>
                    <span style={{
                      fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
                      color: 'var(--accent-sage)', whiteSpace: 'nowrap', minWidth: 50,
                    }}>
                      {key}
                    </span>
                    <span style={{ fontSize: 1, color: 'var(--text-muted)' }}>:</span>
                    <span style={{
                      fontSize: 11, fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)', wordBreak: 'break-all',
                    }}>
                      {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {allCases.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
          No test cases available. Add a custom case or fetch a LeetCode problem.
        </div>
      )}

      {/* Edge cases: built from the function's own parameters (see engine/edgeCases.js) */}
      <div style={{ padding: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wand2 size={14} style={{ color: 'var(--accent-sage)' }} /> Edge cases
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
          {params.length > 0
            ? <>Made for <code style={{ fontFamily: 'var(--font-mono)' }}>({params.map((p) => p.name).join(', ')})</code> from their types, or from the values you typed in. No AI, nothing is sent anywhere.</>
            : 'Write a function, or type some inputs: edge cases follow the function’s parameters.'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EDGE_THEMES.map((theme) => (
            <button
              key={theme.id}
              disabled={params.length === 0}
              title={theme.hint}
              onClick={() => addEdgeCases([theme.id])}
              style={{
                padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)',
                cursor: params.length === 0 ? 'not-allowed' : 'pointer', opacity: params.length === 0 ? 0.5 : 1,
              }}
            >
              {theme.label}
            </button>
          ))}
          <button
            disabled={params.length === 0}
            onClick={() => addEdgeCases(EDGE_THEMES.map((t) => t.id))}
            style={{
              padding: '6px 12px', background: 'transparent', border: '1px solid var(--accent-sage)', borderRadius: 6,
              fontSize: 11, fontWeight: 600, color: 'var(--accent-sage)',
              cursor: params.length === 0 ? 'not-allowed' : 'pointer', opacity: params.length === 0 ? 0.5 : 1,
            }}
          >
            Add all
          </button>
        </div>
        {skipped.length > 0 && (
          <div style={{ fontSize: 11, color: '#B08A30', marginTop: 8, lineHeight: 1.5 }}>
            The type of <b>{skipped.join(', ')}</b> is unknown, so it is left out of generated cases. Type an example value for it in Function Arguments and its shape is used.
          </div>
        )}
      </div>
    </div>
  );
}
