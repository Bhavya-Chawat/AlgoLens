import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Card with a header (title, kind, variables) and a collapsible body. */
export function Card({
  title, kind, badges = [], wide = false, first = false, children, vars = [], defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`vz-card${open ? '' : ' vz-collapsed'}${wide ? ' vz-wide' : ''}${first ? ' vz-first' : ''}`} aria-label={`${kind || ''} ${title || ''}`}>
      <header className="vz-card-head">
        <button className="vz-card-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {title && <span className="vz-card-title">{title}</span>}
        {kind && <span className="vz-card-kind">{kind}</span>}
        {badges.map((b, i) => (
          <span key={i} className={`vz-badge ${b.tone || ''}`}>{b.text}</span>
        ))}
        <span className="vz-card-sp" />
        {vars.length > 1 && <span className="vz-card-kind" title={vars.join(', ')}>{vars.length} vars</span>}
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
