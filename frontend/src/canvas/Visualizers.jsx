import React, { useMemo, useRef, useState } from 'react';

// ============================================================
// COLOR PALETTE
// ============================================================
const POINTER_COLORS = [
  '#D49B84', // terracotta — first pointer
  '#8FAF9D', // sage — second pointer
  '#E7C36A', // amber — third pointer
  '#7EB8D4', // blue — fourth
  '#A78BFA', // purple — fifth+
];

const DEPTH_COLORS = { 0: '#8FAF9D', 1: '#D49B84', 2: '#E7C36A' };
function depthColor(d) { return DEPTH_COLORS[d] ?? '#9CA3AF'; }

// ============================================================
// ARRAY VISUALIZER
// ============================================================
function ArrayVisualizer({ mainArray, pointers, isBugFrame, prevVars }) {
  const { name, info } = mainArray;
  const values  = info.value;
  const n       = values.length;

  const cellW = n <= 8 ? 64 : n <= 16 ? 52 : n <= 32 ? 40 : 32;
  const cellH = 52;
  const totalW = n * cellW;
  const arrowH = 56; // height of SVG pointer region below cells

  // Set of indices pointed to by pointer vars
  const pointedIndices = new Set(Object.values(pointers).filter(v => v >= 0 && v < n));

  // Which indices changed from prev frame?
  const prevArr = prevVars?.[name]?.value;
  const changedIdx = useMemo(() => {
    const s = new Set();
    if (Array.isArray(prevArr) && Array.isArray(values)) {
      values.forEach((v, i) => { if (prevArr[i] !== v) s.add(i); });
    }
    return s;
  }, [prevArr, values]);

  // Group pointers by index to stack labels
  const ptrByIdx = useMemo(() => {
    const m = {};
    Object.entries(pointers).forEach(([pname, idx]) => {
      if (!m[idx]) m[idx] = [];
      m[idx].push(pname);
    });
    return m;
  }, [pointers]);

  const ptrColorMap = useMemo(() => {
    const m = {};
    Object.keys(pointers).forEach((pname, i) => { m[pname] = POINTER_COLORS[i % POINTER_COLORS.length]; });
    return m;
  }, [pointers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
      {/* Label */}
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--canvas-text-muted)',
        marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
        <span style={{ opacity: 0.6 }}>[{n}]</span>
        {info.changedThisFrame && (
          <span style={{
            fontSize: 10, padding: '1px 6px',
            background: 'rgba(231,195,106,0.18)',
            color: '#B08A30', borderRadius: 10, fontWeight: 500,
          }}>changed</span>
        )}
      </div>

      {/* Cells */}
      <div style={{ display: 'flex', position: 'relative' }}>
        {values.map((val, i) => {
          const active   = pointedIndices.has(i);
          const changed  = changedIdx.has(i);
          const isBug    = isBugFrame && active;

          return (
            <div
              key={i}
              style={{
                width: cellW,
                height: cellH,
                borderTop:    '1.5px solid var(--border)',
                borderBottom: '1.5px solid var(--border)',
                borderLeft:   '1.5px solid var(--border)',
                borderRight:  i === n - 1 ? '1.5px solid var(--border)' : 'none',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                background: isBug   ? 'rgba(224,82,82,0.15)'
                           : changed ? 'rgba(231,195,106,0.28)'
                           : active  ? 'rgba(231,195,106,0.10)'
                           : 'var(--bg-card)',
                transition: 'background 220ms ease',
                boxShadow: active && !isBug ? 'inset 0 0 0 1.5px rgba(231,195,106,0.6)' : 'none',
                borderRadius: i === 0 ? '6px 0 0 6px' : i === n - 1 ? '0 6px 6px 0' : 0,
              }}
            >
              {/* Index */}
              <span style={{
                fontSize: 9, fontFamily: 'var(--font-mono)',
                color: 'var(--canvas-text-muted)', lineHeight: 1,
                marginBottom: 3,
              }}>{i}</span>
              {/* Value */}
              <span style={{
                fontSize: cellW >= 52 ? 14 : 12,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: isBug   ? '#E05252'
                      : changed ? '#B08A30'
                      : active  ? '#8C6D1A'
                      : 'var(--canvas-text-primary)',
                transition: 'color 220ms ease',
                lineHeight: 1,
              }}>
                {String(val).length > 6 ? String(val).slice(0, 5) + '…' : String(val)}
              </span>
            </div>
          );
        })}
      </div>

      {/* SVG Pointer arrows */}
      {Object.keys(pointers).length > 0 && (
        <svg
          width={totalW}
          height={arrowH}
          style={{ overflow: 'visible', flexShrink: 0 }}
          aria-hidden="true"
        >
          <defs>
            {POINTER_COLORS.map((c, ci) => (
              <marker
                key={ci}
                id={`arr-head-${ci}`}
                markerWidth="6" markerHeight="6"
                refX="3" refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={c} />
              </marker>
            ))}
          </defs>

          {Object.entries(pointers).map(([pname, idx], pi) => {
            const color    = ptrColorMap[pname];
            const colorIdx = POINTER_COLORS.indexOf(color);
            const cx       = Math.max(0, Math.min(idx * cellW + cellW / 2, totalW - 1));
            const isOOB    = idx < 0 || idx >= n;
            // Stagger y for overlapping pointers at same index
            const stackPos = ptrByIdx[idx]?.indexOf(pname) ?? 0;
            const lineY    = 12 + stackPos * 18;

            return (
              <g
                key={pname}
                style={{
                  transform: `translateX(${cx}px)`,
                  transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {/* Vertical stem */}
                <line
                  x1={0} y1={0} x2={0} y2={lineY - 2}
                  stroke={color} strokeWidth={isOOB ? 1.5 : 2}
                  strokeDasharray={isOOB ? '4,3' : 'none'}
                />
                {/* Arrowhead pointing up into cell */}
                <polygon
                  points="0,-6 -4,4 4,4"
                  fill={color}
                  style={{ transform: 'rotate(180deg)' }}
                />
                {/* Label badge */}
                <g transform={`translate(0, ${lineY + 2})`}>
                  <rect
                    x={-28} y={0} width={56} height={16} rx={8}
                    fill={color} opacity={0.88}
                  />
                  <text
                    x={0} y={11}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    fill="#fff"
                    fontWeight={600}
                  >
                    {pname}={idx}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ============================================================
// HASHMAP VISUALIZER
// ============================================================
function HashMapVisualizer({ hashmaps, prevVars }) {
  if (!hashmaps.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {hashmaps.map(({ name, info }) => {
        const entries = info.value ? Object.entries(info.value) : [];
        const prevEntries = prevVars?.[name]?.value ?? {};

        return (
          <div key={name}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
            }}>
              <span style={{
                fontSize: 11, fontFamily: 'var(--font-mono)',
                color: depthColor(1), fontWeight: 600,
              }}>{name}</span>
              <span style={{
                fontSize: 10, padding: '1px 6px',
                background: 'rgba(212,155,132,0.15)',
                color: '#B06B52', borderRadius: 10,
              }}>{entries.length} entries</span>
              {info.changedThisFrame && (
                <span style={{
                  fontSize: 10, padding: '1px 6px',
                  background: 'rgba(231,195,106,0.18)',
                  color: '#B08A30', borderRadius: 10,
                }}>changed</span>
              )}
            </div>

            {/* Rows */}
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8, overflow: 'hidden',
              maxHeight: 220, overflowY: 'auto',
            }}>
              {/* Column headers */}
              <div style={{
                display: 'flex',
                background: 'var(--bg-canvas)',
                borderBottom: '1px solid var(--border)',
              }}>
                {['Key', 'Value'].map((h) => (
                  <div key={h} style={{
                    flex: 1, padding: '5px 10px',
                    fontSize: 10, fontWeight: 600,
                    color: 'var(--canvas-text-muted)',
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>{h}</div>
                ))}
              </div>

              {entries.length === 0 && (
                <div style={{
                  padding: '12px 10px',
                  fontSize: 12, color: 'var(--canvas-text-muted)',
                  fontFamily: 'var(--font-mono)', textAlign: 'center',
                }}>{'{}'}</div>
              )}

              {entries.slice(0, 20).map(([key, val], ri) => {
                const wasHere    = key in prevEntries;
                const prevVal    = prevEntries[key];
                const valChanged = wasHere && prevVal !== val;
                const isNew      = !wasHere && info.changedThisFrame;

                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      borderBottom: ri < entries.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isNew      ? 'rgba(231,195,106,0.08)'
                                : valChanged ? 'rgba(231,195,106,0.06)'
                                : 'transparent',
                      borderLeft: isNew || valChanged ? '2px solid var(--accent-amber)' : '2px solid transparent',
                      animation: isNew ? 'fadeIn 250ms ease forwards' : 'none',
                      transition: 'background 220ms ease',
                    }}
                  >
                    {/* Key */}
                    <div style={{
                      flex: 1, padding: '7px 10px',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: 'var(--canvas-text-primary)',
                      borderRight: '1px solid var(--border)',
                    }}>
                      {String(key)}
                    </div>
                    {/* Value */}
                    <div style={{
                      flex: 1, padding: '7px 10px',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: valChanged ? '#B08A30' : 'var(--canvas-text-primary)',
                      fontWeight: valChanged ? 600 : 400,
                      transition: 'color 220ms ease',
                    }}>
                      {String(val).length > 30 ? String(val).slice(0, 28) + '…' : String(val)}
                    </div>
                  </div>
                );
              })}

              {entries.length > 20 && (
                <div style={{
                  padding: '6px 10px', fontSize: 11,
                  color: 'var(--canvas-text-muted)',
                  fontFamily: 'var(--font-mono)', textAlign: 'center',
                  background: 'var(--bg-canvas)',
                }}>
                  +{entries.length - 20} more entries
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// GENERIC VARIABLE BOARD
// Shows when no specific structure detected
// ============================================================
function GenericBoard({ vars }) {
  const entries = Object.entries(vars);
  if (!entries.length) return null;

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12,
      alignContent: 'flex-start',
    }}>
      {entries.map(([name, info]) => {
        const changed = info.changedThisFrame;
        const valStr  = formatValue(info.value);

        return (
          <div
            key={name}
            style={{
              minWidth: 100, maxWidth: 220,
              padding: '10px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              borderLeft: changed ? '3px solid var(--accent-sage)' : '1px solid var(--border)',
              boxShadow: changed ? '0 0 0 2px rgba(143,175,157,0.18)' : 'none',
              transition: 'all 220ms ease',
            }}
          >
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--canvas-text-muted)', marginBottom: 6,
              letterSpacing: '0.04em',
            }}>
              {name}
            </div>
            <div style={{
              fontSize: valStr.length > 12 ? 12 : 18,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: changed ? 'var(--accent-amber)' : 'var(--canvas-text-primary)',
              wordBreak: 'break-all',
              lineHeight: 1.3,
              transition: 'color 220ms ease',
            }}>
              {valStr}
            </div>
            <div style={{
              marginTop: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 9, fontFamily: 'var(--font-mono)',
                padding: '1px 5px', borderRadius: 8,
                background: typeColor(info.type).bg,
                color: typeColor(info.type).text,
              }}>
                {info.type}
              </span>
              {changed && info.prevValue !== undefined && info.prevValue !== null && (
                <span style={{
                  fontSize: 9, color: 'var(--canvas-text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  was {String(info.prevValue).slice(0, 12)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// RECURSION TREE (SVG)
// ============================================================
function RecursionTreeViz({ nodes, roots, layoutDims }) {
  const { NW, NH } = layoutDims;
  if (!nodes.length) return null;

  // Compute total SVG bounds
  const allX = nodes.map((n) => n.x ?? 0);
  const allY = nodes.map((n) => n.y ?? 0);
  const minX  = Math.min(...allX);
  const minY  = Math.min(...allY);
  const maxX  = Math.max(...allX) + NW;
  const maxY  = Math.max(...allY) + NH;
  const svgW  = maxX - minX + 20;
  const svgH  = maxY - minY + 20;

  const PAD = 10;

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`${minX - PAD} ${minY - PAD} ${svgW} ${svgH}`}
      style={{ overflow: 'visible', maxWidth: '100%', height: 'auto' }}
    >
      {/* Connection lines */}
      {nodes.map((n) => {
        if (n.parentId === null || n.x === undefined || n.y === undefined) return null;
        const parent = nodes[n.parentId];
        if (!parent || parent.x === undefined) return null;
        const px = parent.x + NW / 2;
        const py = parent.y + NH;
        const cx = n.x + NW / 2;
        const cy = n.y;
        return (
          <line
            key={`line-${n.id}`}
            x1={px} y1={py} x2={cx} y2={cy}
            stroke="var(--canvas-dot)"
            strokeWidth={1.5}
            opacity={n.done ? 0.4 : 0.7}
            style={{ transition: 'opacity 300ms ease' }}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        if (n.x === undefined) return null;
        const depth   = Math.min(n.depth, 3);
        const colors  = [
          { fill: '#EDF5F0', stroke: '#8FAF9D', text: '#2E6B50' }, // sage
          { fill: '#FBF0EB', stroke: '#D49B84', text: '#8B4A2C' }, // terracotta
          { fill: '#FBF6E8', stroke: '#E7C36A', text: '#8C6A14' }, // amber
          { fill: '#F3F4F6', stroke: '#9CA3AF', text: '#374151' }, // gray
        ];
        const c = colors[depth];

        return (
          <g
            key={n.id}
            style={{ transition: 'opacity 300ms ease' }}
            opacity={n.done ? 0.55 : 1}
          >
            {/* Node rect */}
            <rect
              x={n.x} y={n.y} width={NW} height={NH} rx={8}
              fill={c.fill}
              stroke={n.isActive ? '#E7C36A' : c.stroke}
              strokeWidth={n.isActive ? 2.5 : 1.5}
              style={{ transition: 'stroke 220ms ease' }}
              filter={n.isActive ? 'drop-shadow(0 0 4px rgba(231,195,106,0.5))' : 'none'}
            />

            {/* Function name */}
            <text
              x={n.x + NW / 2}
              y={n.y + 15}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fontWeight={600}
              fill={c.text}
            >
              {n.name}
            </text>

            {/* Args */}
            <text
              x={n.x + NW / 2}
              y={n.y + 30}
              textAnchor="middle"
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill={c.text}
              opacity={0.7}
            >
              {String(n.description).slice(0, 22)}
            </text>

            {/* Return value badge */}
            {n.done && n.returnValue && (
              <g>
                <rect
                  x={n.x + NW + 4} y={n.y + NH / 2 - 10}
                  width={Math.min(n.returnValue.length * 7 + 12, 90)} height={20} rx={10}
                  fill={c.stroke} opacity={0.85}
                />
                <text
                  x={n.x + NW + 4 + Math.min(n.returnValue.length * 7 + 12, 90) / 2}
                  y={n.y + NH / 2 + 4}
                  textAnchor="middle"
                  fontSize={9} fontFamily="var(--font-mono)"
                  fill="#fff" fontWeight={600}
                >
                  {n.returnValue.slice(0, 12)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// HELPERS
// ============================================================
function formatValue(val) {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) {
    const inner = val.slice(0, 5).map((v) => String(v)).join(', ');
    return `[${inner}${val.length > 5 ? ', …' : ''}]`;
  }
  if (typeof val === 'object') {
    return JSON.stringify(val).slice(0, 40) + (JSON.stringify(val).length > 40 ? '…' : '');
  }
  return String(val);
}

function typeColor(type) {
  const m = {
    int:     { bg: 'rgba(143,175,157,0.18)', text: '#6A9F82' },
    float:   { bg: 'rgba(143,175,157,0.18)', text: '#6A9F82' },
    str:     { bg: 'rgba(120,160,200,0.18)', text: '#5580A8' },
    bool:    { bg: 'rgba(167,139,250,0.18)', text: '#8058B0' },
    list:    { bg: 'rgba(231,195,106,0.18)', text: '#B08A30' },
    dict:    { bg: 'rgba(212,155,132,0.18)', text: '#C07D63' },
    set:     { bg: 'rgba(212,155,132,0.18)', text: '#C07D63' },
    tuple:   { bg: 'rgba(231,195,106,0.18)', text: '#B08A30' },
    NoneType:{ bg: 'rgba(156,163,175,0.18)', text: '#6B7280' },
  };
  return m[type] ?? m.NoneType;
}

// ============================================================
// LINKED LIST VISUALIZER
// ============================================================
function LinkedListVisualizer({ listData, pointers, prevVars }) {
  const { name, info } = listData;
  const head = info.value;

  // Flatten linked list for horizontal rendering
  const nodes = [];
  let curr = head;
  let cycleDetected = false;
  const seen = new Set();
  
  while (curr && curr !== null) {
    if (seen.has(curr)) {
      cycleDetected = true;
      break;
    }
    seen.add(curr);
    nodes.push(curr);
    curr = curr.next;
  }

  const cellW = 52;
  const cellH = 52;
  const gap = 30;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--canvas-text-muted)', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
        {info.changedThisFrame && (
          <span style={{
            fontSize: 10, padding: '1px 6px', background: 'rgba(231,195,106,0.18)',
            color: '#B08A30', borderRadius: 10, fontWeight: 500,
          }}>changed</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        {nodes.map((node, i) => {
          // Identify if any pointers point to this node
          // In real trace, pointers to nodes might be references or specific IDs.
          // For simplicity, we just render the node.
          const val = node.val ?? node.data ?? node.value ?? '?';
          return (
            <React.Fragment key={i}>
              <div style={{
                width: cellW, height: cellH,
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-card)',
                position: 'relative'
              }}>
                <span style={{
                  fontSize: 14, fontFamily: 'var(--font-mono)',
                  fontWeight: 600, color: 'var(--canvas-text-primary)'
                }}>
                  {String(val).slice(0, 4)}
                </span>
              </div>
              {/* Arrow */}
              {i < nodes.length - 1 && (
                <div style={{
                  width: gap, height: 2, background: 'var(--border)',
                  position: 'relative', display: 'flex', alignItems: 'center'
                }}>
                  <div style={{
                    position: 'absolute', right: -2, width: 0, height: 0,
                    borderTop: '4px solid transparent',
                    borderBottom: '4px solid transparent',
                    borderLeft: '6px solid var(--border)'
                  }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
        {cycleDetected && (
          <div style={{ marginLeft: 8, color: '#E05252', fontSize: 12, fontWeight: 600 }}>
            (Cycle Detected)
          </div>
        )}
        {!cycleDetected && nodes.length > 0 && (
          <div style={{
            width: gap, height: 2, background: 'transparent',
            position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 4
          }}>
            <span style={{ fontSize: 12, color: 'var(--canvas-text-muted)' }}>null</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TREE VISUALIZER
// ============================================================
function TreeVisualizer({ treeData, pointers, prevVars }) {
  const { name, info } = treeData;
  const root = info.value;

  if (!root) return null;

  // Simple recursive layout for binary trees
  function computeTreeLayout(node, depth = 0, xOffset = 0) {
    if (!node) return null;
    const hGap = 60 / (depth + 1);
    const left = node.left ? computeTreeLayout(node.left, depth + 1, xOffset - hGap) : null;
    const right = node.right ? computeTreeLayout(node.right, depth + 1, xOffset + hGap) : null;
    
    return {
      val: node.val ?? node.data ?? node.value ?? '?',
      x: xOffset,
      y: depth * 60,
      left,
      right
    };
  }

  const layout = computeTreeLayout(root);
  
  // Flatten for rendering
  const nodesToRender = [];
  const edgesToRender = [];
  
  function flatten(n, parentX, parentY) {
    if (!n) return;
    if (parentX !== undefined && parentY !== undefined) {
      edgesToRender.push({ x1: parentX, y1: parentY, x2: n.x, y2: n.y });
    }
    nodesToRender.push(n);
    flatten(n.left, n.x, n.y);
    flatten(n.right, n.x, n.y);
  }
  
  flatten(layout);

  const minX = Math.min(...nodesToRender.map(n => n.x));
  const maxX = Math.max(...nodesToRender.map(n => n.x));
  const maxY = Math.max(...nodesToRender.map(n => n.y));
  
  const width = Math.max(300, (maxX - minX) * 2 + 100);
  const height = maxY + 80;
  const shiftX = width / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--canvas-text-muted)', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
        {info.changedThisFrame && (
          <span style={{
            fontSize: 10, padding: '1px 6px', background: 'rgba(231,195,106,0.18)',
            color: '#B08A30', borderRadius: 10, fontWeight: 500,
          }}>changed</span>
        )}
      </div>
      
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        {edgesToRender.map((edge, i) => (
          <line 
            key={i}
            x1={edge.x1 * 1.5 + shiftX} y1={edge.y1 + 20}
            x2={edge.x2 * 1.5 + shiftX} y2={edge.y2 + 20}
            stroke="var(--border)" strokeWidth={2}
          />
        ))}
        {nodesToRender.map((n, i) => (
          <g key={i} transform={`translate(${n.x * 1.5 + shiftX}, ${n.y + 20})`}>
            <circle r={18} fill="var(--bg-card)" stroke="var(--border)" strokeWidth={2} />
            <text 
              textAnchor="middle" dy="5"
              fontSize={12} fontFamily="var(--font-mono)" fontWeight={600}
              fill="var(--canvas-text-primary)"
            >
              {String(n.val).slice(0, 4)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================================
// STACK VISUALIZER
// ============================================================
function StackVisualizer({ stackData, prevVars }) {
  const { name, info } = stackData;
  const values = info.value || [];
  const n = values.length;

  const cellW = 80;
  const cellH = 40;

  const prevArr = prevVars?.[name]?.value;
  const changedIdx = useMemo(() => {
    const s = new Set();
    if (Array.isArray(prevArr) && Array.isArray(values)) {
      values.forEach((v, i) => { if (prevArr[i] !== v) s.add(i); });
    }
    return s;
  }, [prevArr, values]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--canvas-text-muted)', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
        <span style={{ opacity: 0.6 }}>[Stack size: {n}]</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{
          display: 'flex', flexDirection: 'column-reverse', 
          borderLeft: '2px solid var(--border)',
          borderRight: '2px solid var(--border)',
          borderBottom: '2px solid var(--border)',
          padding: '4px',
          background: 'var(--bg-canvas)',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          minHeight: 120,
          minWidth: cellW + 8,
          justifyContent: 'flex-start'
        }}>
          {values.map((val, i) => {
            const changed = changedIdx.has(i);
            return (
              <div
                key={i}
                style={{
                  width: cellW, height: cellH,
                  border: '1.5px solid var(--border)',
                  background: changed ? 'rgba(231,195,106,0.28)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 4, borderRadius: 4,
                  position: 'relative'
                }}
              >
                <span style={{
                  fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: changed ? '#B08A30' : 'var(--canvas-text-primary)'
                }}>
                  {String(val).slice(0, 6)}
                </span>
                {i === n - 1 && (
                  <div style={{
                    position: 'absolute', right: -60, fontSize: 10,
                    fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)', fontWeight: 600
                  }}>
                    ← TOP
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QUEUE VISUALIZER
// ============================================================
function QueueVisualizer({ queueData, prevVars }) {
  const { name, info } = queueData;
  const values = info.value || [];
  const n = values.length;

  const cellW = 50;
  const cellH = 50;

  const prevArr = prevVars?.[name]?.value;
  const changedIdx = useMemo(() => {
    const s = new Set();
    if (Array.isArray(prevArr) && Array.isArray(values)) {
      values.forEach((v, i) => { if (prevArr[i] !== v) s.add(i); });
    }
    return s;
  }, [prevArr, values]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color: 'var(--canvas-text-muted)', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
        <span style={{ opacity: 0.6 }}>[Queue size: {n}]</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        {n > 0 && (
          <div style={{
            position: 'absolute', left: 0, top: -20, fontSize: 10,
            fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)', fontWeight: 600
          }}>
            ↓ FRONT
          </div>
        )}
        <div style={{
          display: 'flex', borderTop: '2px solid var(--border)', borderBottom: '2px solid var(--border)',
          padding: '4px 0', minWidth: 100, minHeight: cellH + 8, background: 'var(--bg-canvas)',
        }}>
          {values.map((val, i) => {
            const changed = changedIdx.has(i);
            return (
              <div
                key={i}
                style={{
                  width: cellW, height: cellH,
                  border: '1.5px solid var(--border)',
                  background: changed ? 'rgba(231,195,106,0.28)' : 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 4, borderRadius: 4,
                }}
              >
                <span style={{
                  fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600,
                  color: changed ? '#B08A30' : 'var(--canvas-text-primary)'
                }}>
                  {String(val).slice(0, 6)}
                </span>
              </div>
            );
          })}
        </div>
        {n > 0 && (
          <div style={{
            position: 'absolute', right: 0, top: -20, fontSize: 10,
            fontFamily: 'var(--font-mono)', color: '#D49B84', fontWeight: 600
          }}>
            ↓ REAR
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// GRAPH VISUALIZER
// ============================================================
function GraphVisualizer({ graphData, prevVars }) {
  const [viewMode, setViewMode] = useState('adj_list'); // 'adj_list' or '2d'
  const { name, info, type } = graphData;

  // Normalize graph to adjacency list
  const adjList = useMemo(() => {
    const list = {};
    const val = info.value;
    if (!val) return list;

    if (type === 'adj_list') {
      // It's already a dict/hashmap of arrays
      for (const [k, v] of Object.entries(val)) {
        list[k] = Array.isArray(v) ? v : [];
      }
    } else if (type === 'matrix') {
      // 2D Array matrix representation
      if (Array.isArray(val)) {
        val.forEach((row, i) => {
          list[i] = [];
          if (Array.isArray(row)) {
            row.forEach((cell, j) => {
              if (cell !== 0 && cell !== null && cell !== false) {
                // simple unweighted / weighted representation
                list[i].push(j);
              }
            });
          }
        });
      }
    }
    return list;
  }, [info.value, type]);

  const nodes = Object.keys(adjList);
  
  // Calculate 2D layout in a circle
  const layout = useMemo(() => {
    const r = Math.max(100, nodes.length * 15);
    const cx = r + 40;
    const cy = r + 40;
    const pos = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      pos[n] = {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle)
      };
    });
    return { pos, width: cx * 2, height: cy * 2 };
  }, [nodes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--canvas-text-muted)' }}>
          <span style={{ color: depthColor(0), fontWeight: 600 }}>{name}</span>
          <span style={{ opacity: 0.6 }}>[{nodes.length} nodes]</span>
        </div>
        
        {/* Toggle View Mode */}
        <div style={{ display: 'flex', background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <button
            onClick={() => setViewMode('adj_list')}
            style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: viewMode === 'adj_list' ? 'var(--accent-sage)' : 'transparent',
              color: viewMode === 'adj_list' ? '#fff' : 'var(--text-muted)'
            }}
          >
            Adjacency List
          </button>
          <button
            onClick={() => setViewMode('2d')}
            style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: viewMode === '2d' ? 'var(--accent-sage)' : 'transparent',
              color: viewMode === '2d' ? '#fff' : 'var(--text-muted)'
            }}
          >
            2D Network
          </button>
        </div>
      </div>

      {viewMode === 'adj_list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 400 }}>
          {nodes.map(node => (
            <div key={node} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 40, height: 32, background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)',
                flexShrink: 0
              }}>
                {node}
              </div>
              <div style={{ width: 24, height: 2, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {adjList[node].length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--canvas-text-muted)', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>empty</span>
                ) : (
                  adjList[node].map((neighbor, idx) => (
                    <div key={idx} style={{
                      padding: '4px 8px', background: 'var(--bg-canvas)', border: '1px solid var(--border)',
                      borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--canvas-text-primary)'
                    }}>
                      {typeof neighbor === 'object' ? JSON.stringify(neighbor) : String(neighbor)}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <svg width={layout.width} height={layout.height} style={{ overflow: 'visible', background: 'var(--bg-canvas)', borderRadius: 12, border: '1px solid var(--border)' }}>
          {/* Edges */}
          {nodes.map(node => (
            adjList[node].map((neighbor, idx) => {
              const p1 = layout.pos[node];
              const p2 = layout.pos[neighbor];
              if (!p1 || !p2) return null;
              return (
                <line 
                  key={`${node}-${neighbor}-${idx}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke="var(--border)" strokeWidth={1.5}
                />
              );
            })
          ))}
          {/* Nodes */}
          {nodes.map(node => {
            const p = layout.pos[node];
            return (
              <g key={node} transform={`translate(${p.x}, ${p.y})`}>
                <circle r={16} fill="var(--bg-card)" stroke="var(--accent-sage)" strokeWidth={2} />
                <text 
                  textAnchor="middle" dy="4"
                  fontSize={11} fontFamily="var(--font-mono)" fontWeight={600}
                  fill="var(--canvas-text-primary)"
                >
                  {node}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ============================================================
// EXPORTS
// ============================================================
export { ArrayVisualizer, HashMapVisualizer, GenericBoard, RecursionTreeViz, LinkedListVisualizer, TreeVisualizer, StackVisualizer, QueueVisualizer, GraphVisualizer };
