import React, { useState, useCallback } from 'react';
import { Play, Plus, AlertCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import CodeEditor from '../components/CodeEditor';
import TopBar from '../components/TopBar';
import {
  PLACEHOLDER_TEST, PLACEHOLDER_CODE,
  RANDOM_INPUTS, EDGE_INPUTS, WORST_INPUTS,
} from '../constants/placeholders';

// ============================================================
// CUSTOM RULES MODAL
// ============================================================
function CustomRulesModal({ onClose }) {
  return (
    <div className="animate-fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="animate-scale-in" style={{
        background: 'var(--bg-card)', borderRadius: 12,
        width: 500, maxWidth: '90%', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
        border: '1px solid var(--border)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)',
          position: 'sticky', top: 0, zIndex: 10
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Custom Code Rules</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            AlgoLens uses an AI-powered AST Transformer to automatically instrument your code. You do NOT need to write complex boilerplate or input parsing logic.
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>1. No Input Parsing Required</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Do not use <code style={{fontFamily:'var(--font-mono)'}}>Scanner</code>, <code style={{fontFamily:'var(--font-mono)'}}>cin</code>, or <code style={{fontFamily:'var(--font-mono)'}}>sys.stdin</code>. The AI will automatically take the inputs from the "Function Arguments" panel and pass them directly into your function.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>2. Function Structure</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You do not need a <code style={{fontFamily:'var(--font-mono)'}}>main</code> method. Simply write your logic inside a function or a class.
              <br/><br/>
              <strong>Python/JS Example:</strong>
              <pre style={{ background: 'var(--bg-canvas)', padding: 10, borderRadius: 6, marginTop: 8, border: '1px solid var(--border)' }}>
def solve(arr, k):{`\n`}    # Your logic here{`\n`}    return arr
              </pre>
              <strong>Java Example:</strong>
              <pre style={{ background: 'var(--bg-canvas)', padding: 10, borderRadius: 6, marginTop: 8, border: '1px solid var(--border)' }}>
class Main {`{`}{`\n`}    public void solve(int[] arr, int k) {`{`}{`\n`}        // Your logic here{`\n`}    {`}`}{`\n`}{`}`}
              </pre>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>3. Supported Output Types</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Return standard data structures like Arrays, Maps, Trees, or Linked Lists, and AlgoLens will automatically detect and visualize them.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-canvas)',
          display: 'flex', justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'var(--accent-sage)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// INPUT BUILDER
// ============================================================
function InputBuilder() {
  const { state, update } = useApp();
  const inputs = state.customInputs || [];

  const updateInput = (index, field, value) => {
    const newInputs = [...inputs];
    newInputs[index] = { ...newInputs[index], [field]: value };
    update({ customInputs: newInputs });
  };

  const addInput = () => {
    update({ customInputs: [...inputs, { key: `arg${inputs.length+1}`, val: '' }] });
  };

  const removeInput = (index) => {
    update({ customInputs: inputs.filter((_, i) => i !== index) });
  };

  const autoDetect = () => {
    const code = state.code || '';
    let params = [];
    if (state.language === 'python') {
      const match = code.match(/def\s+\w+\s*\(([^)]*)\)/);
      if (match && match[1]) params = match[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (state.language === 'javascript') {
      const match = code.match(/function\s+\w+\s*\(([^)]*)\)/) || code.match(/const\s+\w+\s*=\s*(?:function)?\s*\(([^)]*)\)/);
      if (match && match[1]) params = match[1].split(',').map(s => s.trim()).filter(Boolean);
    } else if (state.language === 'java' || state.language === 'cpp') {
      const lines = code.split('\n');
      for (const line of lines) {
        if ((line.includes('public') || line.includes('private') || line.includes('static') || line.includes('vector') || line.includes('int ')) && line.includes('(') && line.includes(')')) {
          if (!line.includes('class ') && !line.includes('main(')) {
            const paramStr = line.substring(line.indexOf('(') + 1, line.indexOf(')'));
            params = paramStr.split(',').map(s => {
              const parts = s.trim().split(/\s+/);
              return parts[parts.length - 1]; 
            }).filter(Boolean);
            break;
          }
        }
      }
    }

    if (params.length > 0) {
      update({ customInputs: params.map(p => ({ key: p.replace(/[^a-zA-Z0-9_]/g, ''), val: '' })) });
    } else {
      alert("Could not automatically detect function parameters. Please ensure your code has a standard function signature.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Function Arguments</span>
        {state.editorMode !== 'leetcode' && (
          <button onClick={autoDetect} style={{ fontSize: 11, color: 'var(--accent-sage)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Auto-Detect Inputs
          </button>
        )}
      </div>
      
      {inputs.map((inp, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={inp.key}
            onChange={(e) => updateInput(i, 'key', e.target.value)}
            placeholder="Name"
            style={{ width: '35%', padding: '6px 8px', fontSize: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none' }}
          />
          <input
            value={inp.val}
            onChange={(e) => updateInput(i, 'val', e.target.value)}
            placeholder='e.g. [1, 2] or "hello"'
            style={{ flex: 1, padding: '6px 8px', fontSize: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
          />
          <button onClick={() => removeInput(i)} style={{ padding: 4, background: 'transparent', border: 'none', color: '#E05252', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      ))}

      <button onClick={addInput} style={{ marginTop: 4, padding: '6px', background: 'rgba(143,175,157,0.1)', color: 'var(--accent-sage)', border: '1px dashed var(--accent-sage)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
        + Add Input
      </button>
    </div>
  );
}

// ============================================================
// TEST PANEL — right column top card
// ============================================================
function TestPanel() {
  const { state, update } = useApp();
  const mode = state.editorMode;
  const setMode = (val) => {
    update({ editorMode: val, testInput: '', code: '' });
  };
  const [leetcodeUrl, setLeetcodeUrl] = useState('');
  const [isLoadingLC, setIsLoadingLC] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const fetchLeetCode = async () => {
    if (!leetcodeUrl) return;
    setIsLoadingLC(true);
    update({ globalLoading: true, globalLoadingText: 'Fetching from LeetCode...' });
    try {
      const res = await fetch('http://localhost:3000/api/leetcode/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: leetcodeUrl, apiKey: state.customApiKey })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Update testcase and editor code template
      let newCode = state.code;
      const currentCodeTrimmed = (state.code || '').trim();
      const isPlaceholder = !currentCodeTrimmed || Object.values(PLACEHOLDER_CODE).some(p => p.trim() === currentCodeTrimmed);

      if (data.snippets && isPlaceholder) {
        const snip = data.snippets.find(s => s.langSlug === state.language);
        if (snip) newCode = snip.code;
      }

      // Convert first testcase into customInputs format
      let newCustomInputs = state.customInputs;
      if (data.testcases && data.testcases.length > 0) {
        const firstTestCase = data.testcases[0];
        if (typeof firstTestCase === 'object' && firstTestCase !== null) {
          newCustomInputs = Object.keys(firstTestCase).map(k => ({
            key: k,
            val: typeof firstTestCase[k] === 'object' ? JSON.stringify(firstTestCase[k]) : String(firstTestCase[k])
          }));
        }
      }
      
      update({ 
        testInput: JSON.stringify(data.testcases, null, 2),
        customInputs: newCustomInputs,
        code: newCode,
        leetcodeProblem: data,
        isLeetcodeModalOpen: true
      });
      
    } catch (err) {
      alert("Failed to fetch LeetCode problem: " + err.message);
    } finally {
      setIsLoadingLC(false);
      update({ globalLoading: false });
    }
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      padding: 20,
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', marginBottom: 16, background: 'var(--bg-canvas)', borderRadius: 8, padding: 4 }}>
        <button
          onClick={() => setMode('custom')}
          style={{
            flex: 1, padding: '6px', border: 'none', borderRadius: 6,
            background: mode === 'custom' ? 'var(--bg-card)' : 'transparent',
            color: mode === 'custom' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
            boxShadow: mode === 'custom' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          Custom
        </button>
        <button
          onClick={() => setMode('leetcode')}
          style={{
            flex: 1, padding: '6px', border: 'none', borderRadius: 6,
            background: mode === 'leetcode' ? 'var(--bg-card)' : 'transparent',
            color: mode === 'leetcode' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
            boxShadow: mode === 'leetcode' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          LeetCode
        </button>
      </div>

      {mode === 'leetcode' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Paste LeetCode URL..."
            value={leetcodeUrl}
            onChange={(e) => setLeetcodeUrl(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', fontSize: 12,
              background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)', outline: 'none'
            }}
          />
          <button 
            onClick={fetchLeetCode}
            disabled={isLoadingLC}
            style={{
              padding: '0 12px', background: 'var(--accent-sage)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isLoadingLC ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoadingLC ? '...' : 'Fetch'}
          </button>
        </div>
      )}

      <InputBuilder />

      {mode === 'custom' && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            onClick={() => setShowRules(true)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: 'none', color: 'var(--accent-sage)', 
              fontSize: 12, fontWeight: 600, cursor: 'pointer' 
            }}
          >
            <AlertCircle size={14} />
            Help & Rules
          </button>
        </div>
      )}
      
      {showRules && <CustomRulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

// ============================================================
// SESSION INFO CARD
// ============================================================
function SessionCard() {
  const { state, update } = useApp();

  const isLeetCode = !!state.leetcodeProblem;
  const problemName = isLeetCode ? state.leetcodeProblem.title : 'Custom Script';
  const categoryStr = (isLeetCode && state.leetcodeProblem.topicTags && state.leetcodeProblem.topicTags.length > 0) 
                   ? state.leetcodeProblem.topicTags.map(t => t.name).join(', ') 
                   : (isLeetCode ? 'Uncategorized' : 'User Code');
  
  const difficulty = isLeetCode ? state.leetcodeProblem.difficulty : 'N/A';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)',
      padding: 20,
      boxShadow: 'var(--shadow-card)',
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 14 }}>
        Session Info
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Problem tag */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Problem</span>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            background: 'rgba(143,175,157,0.12)',
            color: 'var(--accent-sage)',
            borderRadius: 20, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140
          }} title={problemName}>{problemName}</span>
        </div>

        {/* Algo type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>Category</span>
          <span style={{ 
            fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140, textAlign: 'right'
          }} title={categoryStr}>{categoryStr}</span>
        </div>

        {/* Info row */}
        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[{ label: 'Difficulty', val: difficulty }, { label: 'Language', val: state.language }].map((c) => (
            <div key={c.label} style={{
              flex: 1, padding: '8px 10px',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border)',
              borderRadius: 8, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {c.label}
              </div>
              <div style={{ 
                fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
                color: c.val === 'Easy' ? '#2cbb5d' : c.val === 'Medium' ? '#ffc01e' : c.val === 'Hard' ? '#ff375f' : 'var(--text-secondary)'
              }}>
                {c.val}
              </div>
            </div>
          ))}
        </div>

        {isLeetCode && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ label: 'Time', val: state.leetcodeProblem?.timeComplexity || 'O(?)' }, { label: 'Space', val: state.leetcodeProblem?.spaceComplexity || 'O(?)' }].map((c) => (
              <div key={c.label} style={{
                flex: 1, padding: '8px 10px',
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border)',
                borderRadius: 8, textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {c.label}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {c.val}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View Problem Button */}
        {state.leetcodeProblem && (
          <button
            onClick={() => update({ isLeetcodeModalOpen: true })}
            style={{
              marginTop: 4, width: '100%', padding: '8px',
              background: 'rgba(143,175,157,0.1)', color: 'var(--accent-sage)',
              border: '1px solid rgba(143,175,157,0.3)', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'background var(--motion-standard)'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(143,175,157,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(143,175,157,0.1)'}
          >
            View Problem Description
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STATUS INDICATOR
// ============================================================
function StatusDot({ engineStatus, engineMessage }) {
  const { state } = useApp();

  let label, color, pulse;
  if (engineStatus === 'loading') {
    label = engineMessage || 'Initialising runtime…';
    color = 'var(--accent-amber)';
    pulse = true;
  } else if (engineStatus === 'executing') {
    label = 'Executing…';
    color = 'var(--accent-amber)';
    pulse = true;
  } else if (state.executionTrace.length > 0) {
    label = `Complete — ${state.executionTrace.length} frames`;
    color = '#6abf6e';
    pulse = false;
  } else {
    label = 'Ready';
    color = '#6abf6e';
    pulse = false;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: color, flexShrink: 0,
        animation: pulse ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
      }} />
      <span style={{
        fontSize: 12, color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </div>
  );
}

// ============================================================
// ERROR BANNER
// ============================================================
function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '10px 14px',
      background: 'rgba(212,100,84,0.08)',
      border: '1px solid rgba(212,100,84,0.25)',
      borderRadius: 8,
      marginBottom: 4,
    }}>
      <AlertCircle size={14} style={{ color: '#C05540', flexShrink: 0, marginTop: 1 }} />
      <span style={{
        flex: 1, fontSize: 12, color: '#C05540',
        fontFamily: 'var(--font-mono)', lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#C05540', padding: 0, flexShrink: 0,
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ============================================================
// HERO DEBUG BUTTON
// ============================================================
function HeroDebugButton({ onRun, engineStatus, engineMessage }) {
  const busy = engineStatus === 'loading' || engineStatus === 'executing';

  const label = engineStatus === 'loading'
    ? (engineMessage?.slice(0, 34) || 'Initialising runtime…')
    : engineStatus === 'executing'
    ? 'Executing…'
    : 'Visualise';

  return (
    <button
      id="hero-debug-btn"
      onClick={onRun}
      disabled={busy}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '14px 0',
        background: busy ? 'var(--accent-sage-hover)' : 'var(--accent-sage)',
        border: 'none', borderRadius: 'var(--radius-lg)',
        color: '#fff',
        fontSize: 14, fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        cursor: busy ? 'not-allowed' : 'pointer',
        letterSpacing: '0.01em',
        transition: 'all var(--motion-standard)',
        boxShadow: busy ? 'none' : '0 4px 16px rgba(143, 175, 157, 0.35)',
      }}
      onMouseEnter={(e) => {
        if (!busy) {
          e.currentTarget.style.background = 'var(--accent-sage-hover)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(143, 175, 157, 0.5)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!busy) {
          e.currentTarget.style.background = 'var(--accent-sage)';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(143, 175, 157, 0.35)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
      onMouseDown={(e) => { if (!busy) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => { if (!busy) e.currentTarget.style.transform = 'translateY(-1px)'; }}
    >
      {busy ? (
        <>
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2.5px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            animation: 'spin 600ms linear infinite',
            display: 'inline-block', flexShrink: 0,
          }} />
          {label}
        </>
      ) : (
        <>
          <Play size={14} fill="currentColor" />
          {label}
        </>
      )}
    </button>
  );
}

// ============================================================
// CONSOLE OUTPUT PANEL
// ============================================================
function ConsoleOutput({ result, error, onClose }) {
  if (!result && !error) return null;

  return (
    <div className="animate-fade-in-up" style={{
      marginTop: 12, padding: 0, background: 'var(--bg-canvas)',
      border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      maxHeight: 200, overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Console Output
          </span>
          {error && <span style={{ padding: '2px 6px', background: 'rgba(224,82,82,0.1)', color: '#E05252', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Error</span>}
          {result && !error && <span style={{ padding: '2px 6px', background: 'rgba(16,185,129,0.1)', color: '#10B981', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Success</span>}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>
      <div style={{
        padding: '12px', overflowY: 'auto',
        fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5,
        color: error ? '#E05252' : 'var(--text-primary)',
        whiteSpace: 'pre-wrap'
      }}>
        {error ? error : result}
      </div>
    </div>
  );
}

export default function EditorView() {
  const { state, update, traceEngine } = useApp();
  const {
    initEngine, executeCode,
    isReady, engineStatus, engineMessage, error: engineError,
  } = traceEngine;

  const [runError, setRunError] = useState(null);
  const [runOutput, setRunOutput] = useState(null);

  const handleExecute = useCallback(async (isVisualiseMode) => {
    if (engineStatus === 'loading' || engineStatus === 'executing') return;
    setRunError(null);
    setRunOutput(null);

    update({ isRunning: true, globalLoading: isVisualiseMode, globalLoadingText: 'Instrumenting & executing code…' });

    try {
      // Step 1: init Pyodide if needed (only for python)
      if (state.language === 'python' && !isReady) {
        await initEngine();
      }

      // Step 2: get code + testcase (fall back to placeholder)
      const code = state.code || (state.editorMode === 'leetcode' ? PLACEHOLDER_CODE[state.language] : '');
      let testInput = state.testInput || PLACEHOLDER_TEST[state.language];

      const obj = {};
      let hasKeys = false;
      (state.customInputs || []).forEach(i => {
        if (!i.key) return;
        hasKeys = true;
        try { obj[i.key] = JSON.parse(i.val); }
        catch { obj[i.key] = i.val; } // fallback to string
      });
      if (hasKeys) testInput = JSON.stringify([obj]);
      else if (state.editorMode === 'custom') testInput = '[]';

      // Step 3: execute
      const result = await executeCode(state.editorMode, state.language, code, testInput, state.customApiKey, state.judge0ApiKey);

      // Check for syntax errors or execution exceptions
      const frames = result.frames || [];
      const hasException = frames.length > 0 && frames[frames.length - 1].isBugFrame && frames[frames.length - 1].severity === 'error';
      const actualError = result.error || (hasException ? frames[frames.length - 1].description : null);

      if (actualError || frames.length === 0) {
        setRunError(actualError || 'Execution produced no trace. Possible syntax error.');
        update({ isRunning: false, view: 'editor', globalLoading: false });
        return;
      }

      // If it's a successful run and we just clicked "Run"
      if (!isVisualiseMode) {
        const lastFrame = frames[frames.length - 1];
        setRunOutput(`Execution finished in ${frames.length} steps.\nReturn Value: ${lastFrame.returnValue !== undefined ? JSON.stringify(lastFrame.returnValue) : 'None'}`);
        update({ isRunning: false, globalLoading: false });
        return;
      }

      // Step 4: populate context + navigate to visualizer
      update({
        isRunning:      false,
        globalLoading:  false,
        view:           'visualizer',
        executionTrace: frames,
        currentFrame:   0,
        detectedBugs:   result.bugs || [],
        lastExecutedCode: code,
      });
    } catch (err) {
      setRunError(err.message || 'Execution failed.');
      update({ isRunning: false, globalLoading: false });
    }
  }, [engineStatus, isReady, initEngine, executeCode, state, update]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--bg-page)',
    }}>
      <TopBar onRun={() => handleExecute(false)} onVisualise={() => handleExecute(true)} />

      {/* Main body */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex',
        gap: 20,
        padding: 20,
        overflow: 'hidden',
      }}>
        {/* ── Left: Code Editor (65%) ── */}
        <div style={{
          flex: '0 0 65%', display: 'flex', flexDirection: 'column',
          gap: 12, minHeight: 0,
        }}>
          <CodeEditor mode="edit" style={{ flex: 1 }} />

          {/* Console output panel */}
          <ConsoleOutput
            result={runOutput}
            error={runError}
            onClose={() => { setRunError(null); setRunOutput(null); }}
          />

          {/* Error banner */}
          <ErrorBanner
            message={runError || engineError}
            onDismiss={() => setRunError(null)}
          />

          {/* Bottom status strip */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 4px',
          }}>
            <StatusDot engineStatus={engineStatus} engineMessage={engineMessage} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {(state.code || '').split('\n').length} lines
            </span>
          </div>
        </div>

        {/* ── Right: Config column (35%) ── */}
        <div style={{
          flex: '0 0 calc(35% - 20px)',
          display: 'flex', flexDirection: 'column',
          gap: 14, overflowY: 'auto',
        }}>
          <TestPanel />
          {state.editorMode === 'leetcode' && state.leetcodeProblem && <SessionCard />}
          <HeroDebugButton
            onRun={() => handleExecute(true)}
            engineStatus={engineStatus}
            engineMessage={engineMessage}
          />
        </div>
      </div>
    </div>
  );
}
