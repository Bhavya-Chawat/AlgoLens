import React, { useState } from 'react';
import { Columns, Play, Trash2, ArrowRightLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function DiffDebugger() {
  const { state, update } = useApp();
  const { traceA, traceB, diffMode, diffFrameIndex, diffReport, executionTrace } = state;

  const loadTrace = (slot) => {
    if (executionTrace.length === 0) return;
    // deep clone to freeze the trace snapshot
    const cloned = JSON.parse(JSON.stringify(executionTrace));
    update({ [slot]: cloned });
  };

  const clearTrace = (slot) => {
    update({ [slot]: null, diffMode: false });
  };

  const compareTraces = () => {
    if (!traceA || !traceB) return;

    let divergenceFrame = -1;
    let divergedVar = null;
    let valA = null;
    let valB = null;

    const len = Math.min(traceA.length, traceB.length);
    for (let i = 0; i < len; i++) {
      const varsA = traceA[i].variables || {};
      const varsB = traceB[i].variables || {};
      
      const keysA = Object.keys(varsA);
      const keysB = Object.keys(varsB);
      
      let foundMismatch = false;
      
      // Look for mismatched keys or values
      for (let key of new Set([...keysA, ...keysB])) {
        if (!varsA[key] || !varsB[key] || String(varsA[key].value) !== String(varsB[key].value)) {
          divergenceFrame = i;
          divergedVar = key;
          valA = varsA[key]?.value ?? 'undefined';
          valB = varsB[key]?.value ?? 'undefined';
          foundMismatch = true;
          break;
        }
      }

      if (foundMismatch) break;
    }

    if (divergenceFrame === -1 && traceA.length !== traceB.length) {
      divergenceFrame = len;
      divergedVar = 'Execution Length';
      valA = traceA.length > len ? 'continued executing' : 'terminated';
      valB = traceB.length > len ? 'continued executing' : 'terminated';
    }

    let report = '';
    if (divergenceFrame === -1) {
      report = `Execution paths matched perfectly for all ${len} frames. No logic divergence detected.`;
    } else {
      report = `Execution paths matched for frames 0–${Math.max(0, divergenceFrame - 1)}.\n\nAt frame ${divergenceFrame}: variable '${divergedVar}' diverged.\nTrace A: ${divergedVar} = ${valA}\nTrace B: ${divergedVar} = ${valB}\n\n`;
      
      // Look ahead to see final outcomes
      const outA = traceA[traceA.length - 1]?.returnValue ?? 'None';
      const outB = traceB[traceB.length - 1]?.returnValue ?? 'None';
      
      report += `Subsequent behavior:\nTrace A returned ${outA}\nTrace B returned ${outB}`;
    }

    update({
      diffMode: true,
      diffFrameIndex: divergenceFrame === -1 ? len : divergenceFrame,
      diffReport: report,
      currentFrame: Math.max(0, divergenceFrame - 2) // jump slightly before the divergence
    });
  };

  const renderTraceSlot = (label, slotKey, trace) => (
    <div style={{
      padding: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)',
      borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        {trace ? (
          <button onClick={() => clearTrace(slotKey)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14}/></button>
        ) : (
          <button onClick={() => loadTrace(slotKey)} disabled={executionTrace.length === 0} style={{
            padding: '4px 8px', background: 'transparent', border: '1px solid var(--accent-sage)',
            color: 'var(--accent-sage)', borderRadius: 4, fontSize: 11, cursor: 'pointer',
            opacity: executionTrace.length === 0 ? 0.5 : 1
          }}>
            Load Current
          </button>
        )}
      </div>
      
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {trace ? `${trace.length} frames captured.` : 'No trace loaded.'}
      </div>
    </div>
  );

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Columns size={16} style={{ color: 'var(--text-primary)' }} />
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Differential Debugger</h2>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
        Compare two execution traces side-by-side to find exactly where the logic diverges. Run your code once, load Trace A. Modify the code or testcase, run again, and load Trace B.
      </p>

      {renderTraceSlot('Trace A', 'traceA', traceA)}
      {renderTraceSlot('Trace B', 'traceB', traceB)}

      <button
        onClick={compareTraces}
        disabled={!traceA || !traceB}
        style={{
          padding: '12px', background: (!traceA || !traceB) ? 'var(--bg-card)' : 'var(--accent-sage)',
          color: (!traceA || !traceB) ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 600, cursor: (!traceA || !traceB) ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s ease', border: (!traceA || !traceB) ? '1px solid var(--border)' : 'none'
        }}
      >
        <ArrowRightLeft size={16} /> Compare Traces
      </button>

      {diffMode && (
        <div style={{
          marginTop: 8, padding: 16, background: 'rgba(231,195,106,0.08)', border: '1px solid rgba(231,195,106,0.3)',
          borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#B08A30', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Divergence Report
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6
          }}>
            {diffReport}
          </div>
        </div>
      )}
    </div>
  );
}
