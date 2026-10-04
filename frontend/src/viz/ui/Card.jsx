import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Info, RotateCcw, X } from 'lucide-react';
import { helpFor, usePanel } from './panelContext.js';

/**
 * Card with a header (title, kind, variables) and a body. Inside the Stage it can be folded, closed (it stays in
 * the tray above the panels, one click to bring it back) and resized by dragging its bottom-right corner; the
 * Stage remembers all three. On its own (tests, previews) it only folds.
 */
export function Card({
  title, kind, badges = [], wide = false, first = false, children, vars = [], defaultOpen = true,
}) {
  const panel = usePanel();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = panel ? !panel.folded : localOpen;
  const toggle = () => (panel ? panel.setFolded(open) : setLocalOpen((o) => !o));
  const size = panel?.size || null;
  const help = helpFor(kind);

  // The browser's own resize handle sets an inline width / height on the section; remember what the person chose.
  const ref = useRef(null);
  const latest = useRef(panel);
  useEffect(() => { latest.current = panel; });
  const resizable = Boolean(panel);
  useEffect(() => {
    const el = ref.current;
    if (!resizable || !el || typeof ResizeObserver === 'undefined') return undefined;
    let timer = null;
    const watcher = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const w = el.style.width ? Math.round(parseFloat(el.style.width)) : null;
        const h = el.style.height ? Math.round(parseFloat(el.style.height)) : null;
        const known = latest.current?.size;
        if ((w || h) && (Math.abs((w || 0) - (known?.w || 0)) > 2 || Math.abs((h || 0) - (known?.h || 0)) > 2)) latest.current?.setSize({ w, h });
      }, 250);
    });
    watcher.observe(el);
    return () => { clearTimeout(timer); watcher.disconnect(); };
  }, [resizable]);

  const style = size ? { width: size.w ? `${size.w}px` : undefined, height: size.h ? `${size.h}px` : undefined, maxWidth: '100%' } : undefined;

  return (
    <section
      ref={ref}
      className={`vz-card${open ? '' : ' vz-collapsed'}${wide ? ' vz-wide' : ''}${first ? ' vz-first' : ''}`}
      style={style}
      data-sized={size ? '' : undefined}
      aria-label={`${kind || ''} ${title || ''}`}
    >
      <header className="vz-card-head">
        <button className="vz-card-btn" onClick={toggle} aria-label={open ? 'Fold this panel' : 'Unfold this panel'} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {title && <span className="vz-card-title">{title}</span>}
        {kind && <span className="vz-card-kind">{kind}</span>}
        {badges.map((b, i) => (
          <span key={i} className={`vz-badge ${b.tone || ''}`}>{b.text}</span>
        ))}
        <span className="vz-card-sp" />
        {vars.length > 1 && <span className="vz-card-kind" title={vars.join(', ')}>{vars.length} vars</span>}
        {help && <span className="vz-card-btn" title={help} aria-label={`What is this? ${help}`} role="img"><Info size={13} /></span>}
        {panel && size && (
          <button className="vz-card-btn" onClick={() => panel.setSize(null)} aria-label="Reset the size of this panel" title="Reset size"><RotateCcw size={12} /></button>
        )}
        {panel && (
          <button className="vz-card-btn" onClick={panel.close} aria-label="Close this panel" title="Close (it stays in the tray above)"><X size={14} /></button>
        )}
      </header>
      <div className="vz-card-body">{children}</div>
    </section>
  );
}

export function Legend({ items }) {
  return (
    <div className="vz-legend">
      {items.map((it) => (
        <span key={it.label}><i style={{ background: it.color, border: it.border ? `1.5px ${it.border} ${it.color}` : undefined }} />{it.label}</span>
      ))}
    </div>
  );
}
