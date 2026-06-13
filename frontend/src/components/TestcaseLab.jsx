import React, { useState } from 'react';
import { Play, Plus, Trash2, CheckCircle2, XCircle, AlertCircle, Wand2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function TestcaseLab() {
  const { state, traceEngine } = useApp();
  const [testcases, setTestcases] = useState([
    { id: 1, input: state.testInput, expected: '', status: 'not-run', output: null }
  ]);
  const [runningId, setRunningId] = useState(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);

  const addTestcase = (input = '', expected = '') => {
    setTestcases(prev => [
      ...prev,
      { id: Date.now(), input, expected, status: 'not-run', output: null }
    ]);
  };

  const removeTestcase = (id) => {
    setTestcases(prev => prev.filter(tc => tc.id !== id));
  };

  const updateTestcase = (id, updates) => {
    setTestcases(prev => prev.map(tc => tc.id === id ? { ...tc, ...updates } : tc));
  };

  const runTestcase = async (id) => {
    const tc = testcases.find(t => t.id === id);
    if (!tc || !traceEngine.isReady) return;

    setRunningId(id);
    updateTestcase(id, { status: 'running' });

    try {
      const result = await traceEngine.executeCode(state.code, tc.input);
      if (result.error && result.frames?.length === 0) {
        updateTestcase(id, { status: 'error', output: result.error });
        return;
      }

      const finalFrame = result.frames[result.frames.length - 1];
      let actualOutput = null;
      if (finalFrame?.eventType === 'return') {
        actualOutput = String(finalFrame.variables?.[finalFrame.returnValue]?.value ?? finalFrame.returnValue ?? 'None');
      }

      let status = 'pass';
      if (tc.expected && tc.expected.trim() !== '') {
        status = actualOutput === tc.expected.trim() ? 'pass' : 'fail';
      } else {
        status = 'not-run'; // If no expected output, just leave it neutral but show output
      }

      updateTestcase(id, { status, output: actualOutput });

    } catch (err) {
      updateTestcase(id, { status: 'error', output: err.message });
    } finally {
      setRunningId(null);
    }
  };

  const runAll = async () => {
    if (!traceEngine.isReady || isBatchRunning) return;
    setIsBatchRunning(true);
    setBatchProgress(0);

    for (let i = 0; i < testcases.length; i++) {
      setBatchProgress(i);
      await runTestcase(testcases[i].id);
    }
    
    setBatchProgress(testcases.length);
    setIsBatchRunning(false);
  };

  // ── GENERATORS ──
  const handleGenerate = (type) => {
    const code = state.code.toLowerCase();
    const isBinarySearch = code.includes('mid') && code.includes('left') && code.includes('right');
    const isTree = code.includes('node') && code.includes('left') && code.includes('right');
    
    if (type === 'edge') {
      addTestcase('[]');
      addTestcase('[1]');
    } else if (type === 'worst') {
      if (isBinarySearch) addTestcase('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]');
      else addTestcase('[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]');
    } else if (type === 'stress') {
      for (let i = 0; i < 5; i++) {
        const arr = Array.from({length: 15}, () => Math.floor(Math.random() * 100));
        addTestcase(JSON.stringify(arr));
      }
    } else {
      // random
      const arr = Array.from({length: 8}, () => Math.floor(Math.random() * 50));
      addTestcase(JSON.stringify(isBinarySearch ? arr.sort((a,b)=>a-b) : arr));
    }
  };

  const renderStatus = (status) => {
    switch(status) {
      case 'pass': return <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981', fontSize: 11, fontWeight: 600 }}><CheckCircle2 size={14} /> Pass</div>;
      case 'fail': return <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444', fontSize: 11, fontWeight: 600 }}><XCircle size={14} /> Fail</div>;
      case 'error': return <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B', fontSize: 11, fontWeight: 600 }}><AlertCircle size={14} /> Error</div>;
      case 'running': return <div style={{ fontSize: 11, color: 'var(--accent-sage)', fontWeight: 600 }}>Running...</div>;
      default: return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Not run</div>;
    }
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Test Cases</h2>
        <button onClick={() => addTestcase()} style={{
          padding: '4px 10px', background: 'transparent', border: '1px solid var(--accent-sage)',
          color: 'var(--accent-sage)', borderRadius: 6, fontSize: 11, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4
        }}>
          <Plus size={12} /> Add Case
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {testcases.map((tc, i) => (
          <div key={tc.id} style={{
            background: 'var(--bg-canvas)', border: tc.status === 'fail' ? '1px solid #EF4444' : tc.status === 'pass' ? '1px solid #10B981' : '1px solid var(--border)',
            borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Case {i + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {renderStatus(tc.status)}
                <button onClick={() => runTestcase(tc.id)} disabled={runningId === tc.id || isBatchRunning} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 2
                }}><Play size={14} /></button>
                <button onClick={() => removeTestcase(tc.id)} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2
                }}><Trash2 size={14} /></button>
              </div>
            </div>

            <textarea
              value={tc.input} onChange={e => updateTestcase(tc.id, { input: e.target.value })}
              placeholder="Test input..." rows={2}
              style={{
                width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                resize: 'vertical'
              }}
            />
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Expected:</span>
              <input
                type="text" value={tc.expected} onChange={e => updateTestcase(tc.id, { expected: e.target.value })}
                placeholder="(Optional)"
                style={{
                  flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)'
                }}
              />
            </div>

            {(tc.status === 'fail' || tc.status === 'error' || tc.output) && (
              <div style={{ marginTop: 4, padding: 8, background: 'var(--bg-card)', borderRadius: 4, border: '1px dashed var(--border)' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Actual Output:</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: tc.status === 'error' ? '#EF4444' : 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {tc.output || 'No output'}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wand2 size={14} style={{ color: 'var(--accent-sage)' }} /> Generate Test Cases
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['Random Case', 'Edge Case', 'Worst Case', 'Stress Test'].map(type => (
            <button key={type} onClick={() => handleGenerate(type.split(' ')[0].toLowerCase())} style={{
              padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer'
            }}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <button onClick={runAll} disabled={isBatchRunning || !traceEngine.isReady} style={{
        padding: '10px', background: 'var(--accent-sage)', color: '#fff', border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 600, cursor: isBatchRunning ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: isBatchRunning ? 0.7 : 1
      }}>
        {isBatchRunning ? `Running ${batchProgress}/${testcases.length}...` : 'Run All Cases'}
      </button>

    </div>
  );
}
