import React, { useState, useMemo, useEffect } from 'react';
import { Search, History, ChevronRight, ChevronDown, List as ListIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// ============================================================
// HELPERS
// ============================================================
function getPastValues(trace, currentFrame, varName, maxCount = 5) {
  const history = [];
  let lastValStr = null;
  
  for (let i = currentFrame; i >= 0; i--) {
    const v = trace[i].variables?.[varName];
    if (!v) continue;
    
    const valStr = JSON.stringify(v.value);
    if (valStr !== lastValStr) {
      history.push({ frame: i, value: v.value, type: v.type });
      lastValStr = valStr;
    }
    
    if (history.length >= maxCount) break;
  }
  return history;
}

const TYPE_COLORS = {
  int:     { bg: 'rgba(143,175,157,0.18)', text: '#6A9F82' },
  float:   { bg: 'rgba(143,175,157,0.18)', text: '#6A9F82' },
  str:     { bg: 'rgba(212,155,132,0.18)', text: '#C07D63' },
  bool:    { bg: 'rgba(167,139,250,0.18)', text: '#8058B0' },
  list:    { bg: 'rgba(231,195,106,0.18)', text: '#B08A30' },
  dict:    { bg: 'rgba(126,184,212,0.18)', text: '#1E6480' },
  set:     { bg: 'rgba(126,184,212,0.18)', text: '#1E6480' },
  tuple:   { bg: 'rgba(231,195,106,0.18)', text: '#B08A30' },
  NoneType:{ bg: 'rgba(156,163,175,0.18)', text: '#6B7280' },
  TreeNode:{ bg: 'rgba(16,185,129,0.18)', text: '#059669' },
  ListNode:{ bg: 'rgba(16,185,129,0.18)', text: '#059669' },
};

function TypeBadge({ type }) {
  const c = TYPE_COLORS[type] || TYPE_COLORS.NoneType;
  return (
    <span style={{
      padding: '1px 6px', borderRadius: 20,
      fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500,
      background: c.bg, color: c.text, flexShrink: 0,
    }}>
      {type}
    </span>
  );
}

// ============================================================
// ANIMATED NUMBER
// ============================================================
function AnimatedNumber({ value, prevValue }) {
  const [displayVal, setDisplayVal] = useState(value);

  useEffect(() => {
    if (prevValue === undefined || prevValue === null) {
      setDisplayVal(value);
      return;
    }

    const current = Number(value);
    const prev = Number(prevValue);

    if (isNaN(current) || isNaN(prev)) {
      setDisplayVal(value);
      return;
    }

    const delta = Math.abs(current - prev);
    // Count up/down if delta is small
    if (delta > 0 && delta <= 20 && Number.isInteger(current) && Number.isInteger(prev)) {
      let step = prev < current ? 1 : -1;
      let curr = prev;
      
      const interval = setInterval(() => {
        curr += step;
        setDisplayVal(curr);
        if (curr === current) clearInterval(interval);
      }, Math.max(16, 200 / delta));

      return () => clearInterval(interval);
    } else {
      setDisplayVal(value);
    }
  }, [value, prevValue]);

  return <span className="transition-value-fade">{displayVal}</span>;
}

// ============================================================
// VARIABLE ROW
// ============================================================
const VariableRow = React.memo(function VariableRow({ name, info, currentFrame, trace }) {
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const changed = info.changedThisFrame;

  // Render value based on type
  const renderValue = () => {
    if (info.type === 'bool') {
      const isTrue = String(info.value).toLowerCase() === 'true';
      return (
        <span style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
          padding: '2px 6px', borderRadius: 12,
          background: isTrue ? 'rgba(143,175,157,0.15)' : 'rgba(212,155,132,0.15)',
          color: isTrue ? '#2E6B50' : '#8B4A2C',
        }}>
          {isTrue ? 'True' : 'False'}
        </span>
      );
    }
    if (info.type === 'str') {
      const s = String(info.value);
      const trunc = s.length > 40 ? s.slice(0, 38) + '...' : s;
      return <span style={{ color: '#C07D63' }}>"{trunc}"</span>;
    }
    if (info.type === 'int' || info.type === 'float') {
      return <AnimatedNumber value={info.value} prevValue={info.prevValue} />;
    }
    if (info.type === 'NoneType') {
      return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>None</span>;
    }
    if (info.type === 'list' || info.type === 'tuple' || info.type === 'set') {
      const arr = Array.isArray(info.value) ? info.value : [];
      return (
        <button
          onClick={() => setExpandedPreview(!expandedPreview)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          [{arr.length} items]
          {expandedPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      );
    }
    if (info.type === 'dict' || info.type === 'TreeNode' || info.type === 'ListNode') {
      const keys = info.value ? Object.keys(info.value) : [];
      let label = `{${keys.length} keys}`;
      if (info.type === 'TreeNode' || info.type === 'ListNode') {
        const valStr = info.value && info.value.val !== undefined ? info.value.val : '?';
        label = `${info.type}(${valStr})`;
      }
      return (
        <button
          onClick={() => setExpandedPreview(!expandedPreview)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {label}
          {expandedPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      );
    }
    
    // Default fallback
    const s = String(info.value);
    return <span>{s.length > 40 ? s.slice(0, 38) + '...' : s}</span>;
  };

  // Preview renderer
  const renderPreview = () => {
    if (!expandedPreview) return null;
    if (['list', 'tuple', 'set'].includes(info.type)) {
      const arr = Array.isArray(info.value) ? info.value : [];
      return (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 2,
          padding: '8px', background: 'var(--bg-canvas)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}>
          {arr.map((val, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{i}</span>
              <div style={{
                padding: '2px 6px', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 4,
                fontSize: 12, fontFamily: 'var(--font-mono)'
              }}>
                {String(val)}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (info.type === 'dict' || info.type === 'TreeNode' || info.type === 'ListNode') {
      const entries = info.value ? Object.entries(info.value) : [];
      return (
        <div style={{
          padding: '8px', background: 'var(--bg-canvas)',
          borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {entries.map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-muted)', width: 60 }}>{k}:</span>
              <span>{String(v)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // History renderer
  const renderHistory = () => {
    if (!expandedHistory) return null;
    const history = getPastValues(trace, currentFrame, name);
    return (
      <div style={{
        padding: '8px 12px', background: 'var(--bg-canvas)',
        borderTop: '1px dashed var(--border)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recent Values</div>
        {history.map((h, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{String(h.value).slice(0, 30)}</span>
            <span style={{ color: 'var(--text-muted)' }}>frame {h.frame}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px',
        borderLeft: changed ? '3px solid var(--accent-sage)' : '3px solid transparent',
        background: changed ? 'rgba(143,175,157,0.06)' : 'transparent',
        transition: 'background 1s ease, border-color 1s ease',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--text-primary)', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {name}
          </span>
          <TypeBadge type={info.type} />
        </div>
        
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 13,
          color: changed ? 'var(--accent-amber)' : 'var(--text-primary)',
          transition: changed ? 'none' : 'color 1s ease',
        }}>
          {renderValue()}
          
          <button
            onClick={() => setExpandedHistory(!expandedHistory)}
            title="History"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: expandedHistory ? 'var(--text-primary)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', padding: 2,
            }}
          >
            <History size={13} />
          </button>
        </div>
      </div>
      
      {renderPreview()}
      {renderHistory()}
    </div>
  );
});

// ============================================================
// TAB COMPONENT
// ============================================================
export default function VariablesTab() {
  const { state } = useApp();
  const { executionTrace, currentFrame } = state;
  
  const [search, setSearch] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);

  const frame = executionTrace[currentFrame];
  const vars = frame?.variables || {};
  const entries = Object.entries(vars);

  const filteredAndSorted = useMemo(() => {
    let list = entries;
    
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(([name]) => name.toLowerCase().includes(s));
    }
    
    if (changedOnly) {
      list = list.filter(([, info]) => info.changedThisFrame);
    }
    
    // Sort: changed first, then alphabetically
    list.sort((a, b) => {
      if (a[1].changedThisFrame && !b[1].changedThisFrame) return -1;
      if (!a[1].changedThisFrame && b[1].changedThisFrame) return 1;
      return a[0].localeCompare(b[0]);
    });
    
    return list;
  }, [entries, search, changedOnly]);

  if (!executionTrace.length) {
    return (
      <div className="animate-fade-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px', borderBottom: '1px solid var(--border)', opacity: 0.3
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--text-muted)' }} />
              <div style={{ width: 60, height: 12, borderRadius: 4, background: 'var(--text-muted)' }} />
            </div>
            <div style={{ width: 40, height: 12, borderRadius: 4, background: 'var(--text-muted)' }} />
          </div>
        ))}
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>
          Variables appear here during execution.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-canvas)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '4px 8px',
        }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Filter variables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 12, color: 'var(--text-primary)'
            }}
          />
        </div>
        
        {/* Changed Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={e => setChangedOnly(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Changed only</span>
        </label>
      </div>
      
      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredAndSorted.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No matching variables
          </div>
        ) : (
          filteredAndSorted.map(([name, info]) => (
            <VariableRow
              key={name}
              name={name}
              info={info}
              currentFrame={currentFrame}
              trace={executionTrace}
            />
          ))
        )}
      </div>
    </div>
  );
}
