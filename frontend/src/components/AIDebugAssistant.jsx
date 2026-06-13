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

export default function AIDebugAssistant() {
  const { state, update } = useApp();
  const { executionTrace, testcase, detectedBugs } = state;

  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  const activeAnalysis = history.find(h => h.id === activeTabId) || null;

  const runAnalysis = async () => {

    if (!expanded) setExpanded(true);

    const newId = Date.now();
    const newAnalysis = { id: newId, text: '', status: 'loading', errorMsg: '' };
    
    setHistory(prev => {
      const updated = [newAnalysis, ...prev].slice(0, 3); // keep last 3
      return updated;
    });
    setActiveTabId(newId);

    try {
      const summary = summarizeTrace(executionTrace, state.lastExecutedCode, testcase, detectedBugs, state.leetcodeProblem);
      const userPrompt = buildPrompt(summary);

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
                
                // Update history state progressively
                setHistory(prev => prev.map(h => 
                  h.id === newId ? { ...h, text: streamedText } : h
                ));
              } catch (e) {
                // parse error on chunk, ignore
              }
            }
          }
        }
      }

      // Mark done
      setHistory(prev => prev.map(h => 
        h.id === newId ? { ...h, status: 'done' } : h
      ));

    } catch (err) {
      setHistory(prev => prev.map(h => 
        h.id === newId ? { ...h, status: 'error', errorMsg: err.message } : h
      ));
    }
  };

  // ── RENDER HELPERS ──

  // Highlight frame numbers (e.g. "frame 42") and jump to them
  const renderText = (text) => {
    if (!text) return null;
    
    // Remove the algorithm tag before rendering the text
    const cleanText = text.replace(/\[ALGO:\s*.*?\]/i, '').trim();

    // Split by paragraphs
    const paragraphs = cleanText.split('\n\n').filter(p => p.trim());

    // Known variables from the last frame to highlight
    const lastFrameVars = executionTrace[executionTrace.length - 1]?.variables || {};
    const varNames = Object.keys(lastFrameVars).filter(v => v.length > 0);
    
    return paragraphs.map((p, pIdx) => {
      // Regex to match "frame N" or "Frame N"
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

            // Highlight variables if they match exact words
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

  // Heuristics for Stat Cards
  const renderStatCards = (text) => {
    let algo = 'Unknown';
    
    // Extract [ALGO: ...] tag
    const algoMatch = text.match(/\[ALGO:\s*(.*?)\]/i);
    if (algoMatch) {
      algo = algoMatch[1].trim();
      // Push to global state safely if not already there
      if (state.detectedAlgorithm !== algo) {
        setTimeout(() => update({ detectedAlgorithm: algo }), 0);
      }
    }
    
    // Clean text by removing the tag for sentence extraction
    const cleanText = text.replace(/\[ALGO:\s*.*?\]/i, '').trim();

    // Attempt to extract first sentence for root cause
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
      display: 'flex', flexDirection: 'column',
      borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
      height: expanded ? '40%' : 'auto',
      transition: 'height var(--motion-standard)', flexShrink: 0
    }}>
      {/* ── Header Bar ── */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer'
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={16} style={{ color: 'var(--accent-sage)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI Debug</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
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
          {expanded ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* ── Expanded Content ── */}
      {expanded && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* History Tabs */}
          {history.length > 0 && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', gap: 16 }}>
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

          {/* Content Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {!activeAnalysis && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 16 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                  <path d="M2 12h4l2-9 5 18 3-10 3 5h3"></path>
                </svg>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Analyze your execution to get AI insights.
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

          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>
            Each analysis uses approx. 500 tokens. (Groq Free Tier)
          </div>
        </div>
      )}
    </div>
  );
}
