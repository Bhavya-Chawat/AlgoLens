import React from 'react';

export function IntervalVisualizer({ intervals, isBugFrame, prevVars }) {
  if (!intervals || !Array.isArray(intervals)) return null;

  // Flatten intervals to find min and max domain
  let minVal = Infinity;
  let maxVal = -Infinity;
  intervals.forEach(interval => {
    if (Array.isArray(interval) && interval.length === 2) {
      minVal = Math.min(minVal, interval[0]);
      maxVal = Math.max(maxVal, interval[1]);
    }
  });

  if (minVal === Infinity) {
    minVal = 0; maxVal = 10;
  }

  // Pack intervals into rows (Gantt chart logic)
  const sortedIntervals = intervals
    .map((inv, idx) => ({ start: inv[0], end: inv[1], originalIndex: idx }))
    .sort((a, b) => a.start - b.start);

  const rows = [];
  sortedIntervals.forEach(interval => {
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const lastInRow = row[row.length - 1];
      if (interval.start > lastInRow.end) {
        row.push(interval);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([interval]);
    }
  });

  const range = maxVal - minVal;
  const padding = range === 0 ? 2 : Math.max(1, range * 0.1);
  const scaleMin = minVal - padding;
  const scaleMax = maxVal + padding;
  const scaleRange = scaleMax - scaleMin;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: '100%', minHeight: rows.length * 30 + 40, minWidth: 300 }}>
        {/* Axis */}
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, height: 2, background: 'var(--border)' }} />
        
        {/* Rows */}
        {rows.map((row, rIdx) => (
          row.map(interval => {
            const leftPct = ((interval.start - scaleMin) / scaleRange) * 100;
            const widthPct = Math.max(2, ((interval.end - interval.start) / scaleRange) * 100);
            return (
              <div
                key={interval.originalIndex}
                style={{
                  position: 'absolute',
                  top: rIdx * 30,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: 20,
                  background: 'rgba(126,184,212,0.2)',
                  border: '1px solid #7EB8D4',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#5BA4C8',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                [{interval.start}, {interval.end}]
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
