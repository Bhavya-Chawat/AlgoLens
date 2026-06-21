import React, { useState, useRef, useEffect } from 'react';
import { Bot, ChevronDown, ChevronUp, AlertCircle, Settings, ExternalLink, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { summarizeTrace, buildPrompt } from '../engine/traceAnalyzer';

// System prompt adapted from Phase 6 spec
const SYSTEM_PROMPT = `You are AlgoLens AI, a mentoring assistant for competitive programming. You analyze execution traces and provide gentle, Socratic hints to help the user find their own bugs.

Your analysis must always:
1. NEVER directly answer the given question or give the full solution.
2. Provide a SLIGHT HINT that points the user in the right direction.
3. State what the code is doing incorrectly without giving away the exact fix.
4. Keep the tone encouraging and mentoring.
5. On the very first line, output exactly [ALGO: <Algorithm Name>] where <Algorithm Name> is the algorithm paradigm being used (e.g., BFS, Sliding Window, Dynamic Programming, Two Pointers).

Be specific but do not write the corrected code. Reference variable names and frame numbers to point out where the logic starts deviating.

Respond in clean plain text. No markdown. No bullet points. Use short paragraphs.
Maximum 2 paragraphs.`;

export default function AIDebugAssistant({ isOpen, onClose }) {
  const { state, update } = useApp();
  const { executionTrace, testcase, detectedBugs } = state;

  const [history, setHistory] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  
  const [pos, setPos] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ w: 400, h: 500 });
  
  // Initialize position once
  useEffect(() => {
    setPos({ x: window.innerWidth - 440, y: window.innerHeight - 560 });
  }, []);

  const activeAnalysis = history.find(h => h.id === activeTabId) || null;

  if (!isOpen) return null;

  const startDrag = (e) => {
    // Prevent drag if clicking on buttons or scrollable areas
    if (e.target.closest('button') || e.target.closest('.no-drag')) return;
    
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;

    const onMove = (ev) => {
      setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;
    const startPosX = pos.x;
    const startPosY = pos.y;

    const onMove = (ev) => {
      if (direction === 'se') {
        setSize({ w: Math.max(300, startW + (ev.clientX - startX)), h: Math.max(300, startH + (ev.clientY - startY)) });
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const runAnalysis = async () => {
    const newId = Date.now();
    const newAnalysis = { id: newId, text: '', status: 'loading', errorMsg: '' };
    
    setHistory(prev => {
      const updated = [newAnalysis, ...prev].slice(0, 3);
      return updated;
    });
    setActiveTabId(newId);

    try {
      const summary = summarizeTrace(executionTrace, state.lastExecutedCode, testcase, detectedBugs, state.leetcodeProblem);
      const userPrompt = buildPrompt(summary, state.isSummarized);

      const response = await fetch('http://localhost:3000/api/hint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: state.customApiKey,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let streamedText = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices[0]?.delta?.content || '';
                streamedText += delta;
                
                setHistory(prev => prev.map(h => 
                  h.id === newId ? { ...h, text: streamedText } : h
                ));
              } catch (e) {}
            }
          }
        }
      }

      setHistory(prev => prev.map(h => 
        h.id === newId ? { ...h, status: 'done' } : h
      ));

    } catch (err) {
      setHistory(prev => prev.map(h => 
        h.id === newId ? { ...h, status: 'error', errorMsg: err.message } : h
      ));
    }
  };

  const renderText = (text) => {
    if (!text) return null;
    const cleanText = text.replace(/\[ALGO:\s*.*?\]/i, '').trim();
    const paragraphs = cleanText.split('\n\n').filter(p => p.trim());
    const lastFrameVars = executionTrace[executionTrace.length - 1]?.variables || {};
    const varNames = Object.keys(lastFrameVars).filter(v => v.length > 0);
    
    return paragraphs.map((p, pIdx) => {
      const frameRegex = /(frame\s+\d+)/gi;
      const parts = p.split(frameRegex);

      return (
        <p key={pIdx} style={{
          fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)',
          margin: '0 0 12px 0', fontFamily: 'var(--font-sans)'
        }}>
          {parts.map((part, i) => {
            const isFrameMatch = frameRegex.test(part);
            if (isFrameMatch) {
              const frameNum = parseInt(part.replace(/\D/g, ''), 10);
              return (
                <span
                  key={i}
                  onClick={() => update({ currentFrame: Math.min(frameNum, executionTrace.length - 1), isPlaying: false })}
                  style={{
                    color: 'var(--accent-sage)', textDecoration: 'underline',
                    textUnderlineOffset: 2, cursor: 'pointer', fontWeight: 600
                  }}
                >
                  {part}
                </span>
              );
            }

            let textSpan = part;
            varNames.forEach(v => {
              const regex = new RegExp(`\\b${v}\\b`, 'g');
              textSpan = textSpan.replace(regex, `|VAR|${v}|ENDVAR|`);
            });

            const varParts = textSpan.split(/\|VAR\|(.*?)\|ENDVAR\|/);
            return varParts.map((vp, vIdx) => {
              if (varNames.includes(vp)) {
                return (
                  <span key={vIdx} style={{
                    background: 'rgba(212,155,132,0.15)', color: '#A55D40',
                    padding: '1px 4px', borderRadius: 4, fontFamily: 'var(--font-mono)',
                    fontSize: 12
                  }}>
                    {vp}
                  </span>
                );
              }
              return <span key={vIdx}>{vp}</span>;
            });
          })}
        </p>
      );
    });
  };

  const renderStatCards = (text) => {
    let algo = 'Unknown';
    const algoMatch = text.match(/\[ALGO:\s*(.*?)\]/i);
    if (algoMatch) {
      algo = algoMatch[1].trim();
      if (state.detectedAlgorithm !== algo) {
        setTimeout(() => update({ detectedAlgorithm: algo }), 0);
      }
    }
    const cleanText = text.replace(/\[ALGO:\s*.*?\]/i, '').trim();
    const firstSentence = cleanText.split(/[.!?]/)[0] + '.';

    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: 10, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-amber)' }} />
            Hint Summary
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {firstSentence.length > 5 ? firstSentence : 'Analysis complete.'}
          </div>
        </div>
        <div style={{ flex: 1, padding: 10, background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Detected Algorithm</div>
          <div style={{ fontSize: 11, color: 'var(--accent-sage)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{algo}</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute',
      top: pos.y, left: pos.x,
      width: size.w, height: size.h,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-panel)',
      zIndex: 9999,
      overflow: 'hidden'
    }}>
      {/* ── Header Bar ── */}
      <div
        onMouseDown={startDrag}
        style={{
          padding: '0 16px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'grab', flexShrink: 0, borderBottom: '1px solid var(--border)', background: 'var(--bg-canvas)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={16} style={{ color: 'var(--accent-sage)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Debug Assistant</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={runAnalysis}
            disabled={activeAnalysis?.status === 'loading' || executionTrace.length === 0}
            style={{
              padding: '4px 12px', background: 'var(--accent-sage)', color: '#fff',
              border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: (activeAnalysis?.status === 'loading' || executionTrace.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (activeAnalysis?.status === 'loading' || executionTrace.length === 0) ? 0.7 : 1
            }}
          >
            {activeAnalysis?.status === 'loading' ? 'Analyzing...' : 'Get Hint'}
          </button>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="no-drag" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {history.length > 0 && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', gap: 16, flexShrink: 0 }}>
            {history.map((h, i) => (
              <button
                key={h.id}
                onClick={() => setActiveTabId(h.id)}
                style={{
                  padding: '8px 0', border: 'none', background: 'transparent',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  color: activeTabId === h.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: activeTabId === h.id ? '2px solid var(--accent-sage)' : '2px solid transparent'
                }}
              >
                Analysis {history.length - i}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {!activeAnalysis && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 16 }}>
                <Bot size={48} style={{ color: 'var(--border)', opacity: 0.8 }} />
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Analyze your execution to get AI insights without giving away the answer.
                </div>
              </div>
            )}

            {activeAnalysis && activeAnalysis.status === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 20 }}>
                <AlertCircle size={24} style={{ color: '#E05252' }} />
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Analysis unavailable</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeAnalysis.errorMsg}</div>
                <button onClick={runAnalysis} style={{ padding: '6px 12px', border: '1px solid var(--border)', background: 'var(--bg-canvas)', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: 'var(--text-primary)' }}>Retry</button>
              </div>
            )}

            {activeAnalysis && (activeAnalysis.status === 'loading' && !activeAnalysis.text) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Reading {executionTrace.length} frames...</div>
                <div className="shimmer" style={{ height: 12, width: '100%', borderRadius: 4, background: 'var(--border)' }} />
                <div className="shimmer" style={{ height: 12, width: '90%', borderRadius: 4, background: 'var(--border)' }} />
                <div className="shimmer" style={{ height: 12, width: '95%', borderRadius: 4, background: 'var(--border)' }} />
              </div>
            )}

            {activeAnalysis && activeAnalysis.text && (
              <div>
                {activeAnalysis.status === 'done' && renderStatCards(activeAnalysis.text)}
                {renderText(activeAnalysis.text)}
                {activeAnalysis.status === 'loading' && <span style={{ display: 'inline-block', width: 6, height: 12, background: 'var(--accent-sage)', animation: 'blink 1s step-end infinite' }} />}
              </div>
            )}
        </div>
      </div>
      
      {/* Resize Handle (Bottom Right) */}
      <div
        onMouseDown={(e) => startResize(e, 'se')}
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
          cursor: 'se-resize', zIndex: 10
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', bottom: 2, right: 2 }}>
          <path d="M10 14L14 10M6 14L14 6" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}
