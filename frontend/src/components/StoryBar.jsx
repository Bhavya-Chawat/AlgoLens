import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { seriesFor } from '../viz/storyMarks.js';
import { getApproaches } from '../api/auth.js';
import { useAuth } from '../context/AuthContext';

const W = 240;
const H = 46;
const PAD = 5;

/** A numeric variable over the whole run: one line, a dot per change, a marker where you are. Click to jump. */
function TrendChart({ name, points, total, current, onJump }) {
  const vals = points.map((p) => p.v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (idx) => PAD + (total > 1 ? idx / (total - 1) : 0) * (W - 2 * PAD);
  const y = (v) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.idx).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const now = [...points].reverse().find((p) => p.idx <= current) || points[0];

  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const target = ((e.clientX - box.left) / box.width) * (total - 1);
    const nearest = points.reduce((best, p) => (Math.abs(p.idx - target) < Math.abs(best.idx - target) ? p : best), points[0]);
    onJump(nearest.idx);
  };

  return (
    <div className="vz-trend">
      <div className="vz-trend-label">
        <span className="vz-trend-name">{name}</span>
        <span className="vz-trend-now">{now.v}</span>
        <span className="vz-trend-range">{lo === hi ? '' : `${lo} … ${hi}`}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onClick={pick} role="img" aria-label={`${name} over the run: click to jump`} style={{ cursor: 'pointer', display: 'block' }}>
        <path d={path} fill="none" stroke="var(--vz-line-2)" strokeWidth="1.6" strokeLinejoin="round" />
        {points.map((p) => <circle key={p.idx} cx={x(p.idx)} cy={y(p.v)} r={p.idx === now.idx ? 3.6 : 2} fill={p.idx === now.idx ? 'var(--vz-point)' : 'var(--vz-ink-3)'} />)}
        <line x1={x(current)} x2={x(current)} y1={2} y2={H - 2} stroke="var(--vz-point)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
      </svg>
    </div>
  );
}

/** What this person (and, once two agree to share, other people) used on the same problem. */
function Approaches({ slug }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!user || !slug) return undefined;
    let off = false;
    getApproaches(slug).then((d) => { if (!off) setData(d); }).catch(() => {});
    return () => { off = true; };
  }, [user, slug]);
  if (!data || (!data.mine.length && !data.others.length)) return null;
  const list = (rows) => rows.map((r) => `${r.algorithm} (${r.count})`).join(', ');
  return (
    <div className="vz-story-approaches">
      {data.mine.length > 0 && <span>You used: {list(data.mine)}.</span>}
      {data.others.length > 0 && <span> Others on this problem: {list(data.others)}. There is more than one way to solve it.</span>}
    </div>
  );
}

/**
 * The AI "Explain" strip above the stage. Idle: one button. Ready: the algorithm in a few words, one sentence,
 * a few milestones to jump to, and a chart or two. Nothing here is long: the pictures do the explaining.
 */
export default function StoryBar({ story: s, model, currentFrame, onJump, slug }) {
  const { phase, story, error, cached, explain, dismiss } = s;
  const total = model.frames.length;
  const charts = useMemo(
    () => (story ? story.series.map((name) => ({ name, points: seriesFor(name, model) })).filter((c) => c.points.length >= 2) : []),
    [story, model],
  );

  if (phase !== 'ready') {
    return (
      <div className="vz-story vz-story-bar">
        <button className="vz-story-btn" onClick={explain} disabled={phase === 'loading'}>
          <Sparkles size={13} />
          {phase === 'loading' ? 'Reading your run…' : phase === 'error' ? 'Try again' : 'Explain this run'}
        </button>
        <span className="vz-story-hint" role={phase === 'error' ? 'alert' : undefined} data-error={phase === 'error' ? '1' : undefined}>
          {phase === 'error' ? error : 'One AI request, only when you press this, using your own Groq key. It marks what matters on the pictures below.'}
        </span>
      </div>
    );
  }

  return (
    <section className="vz-story vz-story-card" aria-label="Explanation of this run">
      <div className="vz-story-head">
        <Sparkles size={13} />
        <b>{story.algorithm || 'This run'}</b>
        {story.idea && <span className="vz-story-idea">{story.idea}</span>}
        <span style={{ flex: 1 }} />
        {cached && <span className="vz-badge" title="Answered earlier for this exact run: no new request was made">saved</span>}
        <button className="vz-card-btn" onClick={dismiss} aria-label="Hide the explanation" title="Hide (the marks go away too)"><X size={14} /></button>
      </div>
      {story.steps.length > 0 && (
        <div className="vz-story-steps">
          {story.steps.map((m) => (
            <button key={m.at} className="vz-story-step" onClick={() => onJump(m.at)} title={`Jump to step ${m.at + 1}`}>
              <span className="n">step {m.at + 1}</span>
              {m.text}
            </button>
          ))}
        </div>
      )}
      {charts.length > 0 && (
        <div className="vz-story-charts">
          {charts.map((c) => <TrendChart key={c.name} name={c.name} points={c.points} total={total} current={currentFrame} onJump={onJump} />)}
        </div>
      )}
      <Approaches slug={slug} />
    </section>
  );
}
