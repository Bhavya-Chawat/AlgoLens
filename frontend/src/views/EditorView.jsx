import React, { useState, useCallback, useEffect } from 'react';
import { Play, AlertCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiJson } from '../api/client';
import { entryLabel, argsFromInputs } from '../engine/buildJob';
import CodeEditor from '../components/CodeEditor';
import TopBar from '../components/TopBar';
import {
  PLACEHOLDER_CODE, LEETCODE_LANG,
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
            AlgoLens really runs your code and records every step, so what you see is what your program actually did. You do not need boilerplate or input parsing.
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>1. No Input Parsing Required</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Do not use <code style={{fontFamily:'var(--font-mono)'}}>Scanner</code>, <code style={{fontFamily:'var(--font-mono)'}}>cin</code>, or <code style={{fontFamily:'var(--font-mono)'}}>sys.stdin</code>. The values in the "Function Arguments" panel are passed straight into your function, matched by parameter name. Lists like <code style={{fontFamily:'var(--font-mono)'}}>[3,9,20,null,null,15,7]</code> become real tree / linked-list nodes when the parameter is a TreeNode / ListNode.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>2. Function Structure</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You do not need a <code style={{fontFamily:'var(--font-mono)'}}>main</code> method. Write your logic inside a function or a <code style={{fontFamily:'var(--font-mono)'}}>Solution</code> class. If your code is a script (it already calls things at the top level), choose "Script" in <strong>Run as</strong>.
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
    const candidates = state.entryCandidates || [];
    const chosen = state.entryChoice === 'auto' || state.entryChoice === 'script'
      ? candidates[0]
      : candidates.find((c) => entryLabel(c) === state.entryChoice);
    if (chosen && chosen.params.length > 0) {
      const existing = argsFromInputs(inputs);
      update({
        customInputs: chosen.params.map((p) => ({
          key: p.name,
          val: p.name in existing ? inputs.find((i) => i.key === p.name)?.val ?? '' : '',
        })),
      });
    } else {
      alert('No function with parameters found. Write a function (or a Solution class) first.');
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
// RUN AS — which function (or the whole script) gets executed
// ============================================================
function RunAsSelector() {
  const { state, update } = useApp();
  const candidates = state.entryCandidates || [];
  if (candidates.length === 0 && !state.scriptLike) return null;

  const auto = state.scriptLike && Object.keys(argsFromInputs(state.customInputs)).length === 0
    ? 'script'
    : candidates[0] ? entryLabel(candidates[0]) : 'script';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Run as</span>
      <select
        value={state.entryChoice}
        onChange={(e) => update({ entryChoice: e.target.value })}
        style={{
          flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 12, fontFamily: 'var(--font-mono)',
          background: 'var(--bg-canvas)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 6, outline: 'none',
        }}
      >
        <option value="auto">Auto ({auto === 'script' ? 'script' : `${auto}()`})</option>
        {candidates.map((c) => (
          <option key={entryLabel(c)} value={entryLabel(c)}>
            {entryLabel(c)}({c.params.map((p) => p.name).join(', ')}){c.isHelper ? '  · helper' : ''}
          </option>
        ))}
        <option value="script">Script (run top to bottom)</option>
      </select>
    </div>
  );
}

// ============================================================
// TEST PANEL — right column top card
// ============================================================
function TestPanel() {
  const { state, update } = useApp();
  const mode = state.editorMode;
  // Switching mode must never throw away what the user typed.
  const setMode = (val) => update({ editorMode: val });
  const [leetcodeUrl, setLeetcodeUrl] = useState('');
  const [isLoadingLC, setIsLoadingLC] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const fetchLeetCode = async () => {
    if (!leetcodeUrl) return;
    setIsLoadingLC(true);
    update({ globalLoading: true, globalLoadingText: 'Fetching from LeetCode...' });
    try {
      // Parsing is done locally on the server (no AI, no tokens).
      const data = await apiJson('/leetcode/fetch', { body: { url: leetcodeUrl } });

      const snippet = (data.snippets || []).find((s) => s.langSlug === LEETCODE_LANG[state.language]);
      const first = data.testcases?.[0];
      update({
        testInput: JSON.stringify(data.testcases || [], null, 2),
        customInputs: first
          ? Object.entries(first).map(([key, value]) => ({ key, val: JSON.stringify(value) }))
          : state.customInputs,
        code: snippet ? snippet.code : state.code,
        leetcodeProblem: data,
        entryChoice: 'auto',
        isLeetcodeModalOpen: true,
      });
    } catch (err) {
      alert('Failed to fetch LeetCode problem: ' + err.message);
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

      <RunAsSelector />
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
            textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%'
          }} title={problemName}>{problemName}</span>
        </div>

        {/* Algo type */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>Category</span>
          <span style={{ 
            fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
            textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%'
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
      border: '1px solid var(--border)', borderRadius: 10,
      display: 'flex', flexDirection: 'column',
      maxHeight: 240, overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Console Output
          </span>
          {error && <span style={{ padding: '2px 6px', background: 'rgba(224,82,82,0.1)', color: '#E05252', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Error</span>}
          {result && !error && <span style={{ padding: '2px 6px', background: 'rgba(16,185,129,0.1)', color: '#10B981', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Success</span>}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
          <X size={14} />
        </button>
      </div>
      <div className="console-output-content" style={{
        padding: '12px 14px',
        fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
        color: error ? '#E05252' : 'var(--text-primary)',
        whiteSpace: 'pre-wrap', flex: 1,
        overflowY: 'auto',
      }}>
        {result}{result && error ? '\n\n' : ''}{error}
      </div>
    </div>
  );
}

const formatError = (e) => (e ? `${e.type}: ${e.message}${e.line ? ` (line ${e.line})` : ''}` : null);

function consoleText(built) {
  const parts = [];
  if (built.stdout) parts.push(built.stdout.replace(/\n$/, ''));
  if (built.stdoutClipped) parts.push('… output was cut at 64 KB');
  if (built.result !== null && built.result !== undefined) parts.push(`→ returned ${built.result}`);
  const notes = [`${built.frames.length} steps`];
  if (built.truncated) notes.push('stopped at the step limit');
  parts.push(`(${notes.join(', ')})`);
  return parts.join('\n');
}

export default function EditorView() {
  const { state, update, traceEngine } = useApp();
  const { run, inspect, engineStatus, engineMessage, error: engineError } = traceEngine;

  const [runError, setRunError] = useState(null);
  const [runOutput, setRunOutput] = useState(null);

  // Keep the "Run as" candidates in sync with the code (parsed locally, debounced).
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      let info = { entries: [], scriptLike: false };
      try {
        const found = await inspect(state.language, state.code || '');
        if (found && !found.error) info = found;
      } catch { /* runtime unavailable: fall back to no candidates */ }
      if (cancelled) return;
      const labels = info.entries.map(entryLabel);
      update((prev) => ({
        entryCandidates: info.entries,
        scriptLike: Boolean(info.scriptLike),
        // a stale choice (function renamed/removed) quietly goes back to automatic
        entryChoice: prev.entryChoice === 'auto' || prev.entryChoice === 'script' || labels.includes(prev.entryChoice) ? prev.entryChoice : 'auto',
      }));
    }, 500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [state.code, state.language, inspect, update]);

  const handleExecute = useCallback(async (visualise) => {
    if (engineStatus === 'loading' || engineStatus === 'executing') return;
    setRunError(null);
    setRunOutput(null);
    update({ isRunning: true, globalLoading: visualise, globalLoadingText: 'Running your code…' });

    try {
      const built = await run(state);
      const code = state.code || (state.editorMode === 'leetcode' ? PLACEHOLDER_CODE[state.language] : '');

      // Nothing to show (syntax error, bad arguments...): stay here and explain.
      if (built.frames.length === 0) {
        setRunError(formatError(built.error) || 'Nothing was executed.');
        update({ isRunning: false, view: 'editor', globalLoading: false });
        return;
      }

      if (!visualise) {
        setRunOutput(consoleText(built));
        if (built.error) setRunError(formatError(built.error));
        update({ isRunning: false, globalLoading: false });
        return;
      }

      // A crashing run is exactly what you want to look at: it goes to the visualiser too.
      update({
        isRunning: false,
        globalLoading: false,
        view: 'visualizer',
        executionTrace: built.frames,
        currentFrame: 0,
        detectedBugs: built.bugs,
        lastExecutedCode: code,
        executionResult: built.result,
        traceStdout: built.stdout,
        traceMeta: built.meta,
      });
    } catch (err) {
      setRunError(err.message || 'Execution failed.');
      update({ isRunning: false, globalLoading: false });
    }
  }, [engineStatus, run, state, update]);
  // Resizing Logic
  const [leftWidth, setLeftWidth] = React.useState(65);

  const startDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftWidth;
    const totalWidth = window.innerWidth;

    const onMove = (ev) => {
      const deltaPx = ev.clientX - startX;
      const deltaPct = (deltaPx / totalWidth) * 100;
      const newW = Math.max(30, Math.min(80, startW + deltaPct)); // Min 30%, Max 80%
      setLeftWidth(newW);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

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
        padding: 20,
        overflow: 'hidden',
      }}>
        {/* ── Left: Code Editor ── */}
        <div style={{
          flex: `0 0 calc(${leftWidth}% - 10px)`, display: 'flex', flexDirection: 'column',
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

        {/* ── Resize Handle ── */}
        <div
          onMouseDown={startDrag}
          style={{
            flex: '0 0 20px',
            cursor: 'col-resize',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <div style={{ width: 4, height: 32, background: 'var(--border)', borderRadius: 4 }} />
        </div>

        {/* ── Right: Config column ── */}
        <div style={{
          flex: `0 0 calc(${100 - leftWidth}% - 10px)`,
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
