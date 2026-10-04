import { apiJson } from '../api/client.js';
import { recognize } from '../viz/recognize.js';
import { marksThatHold, sampleSteps, seriesFor } from '../viz/storyMarks.js';

/**
 * "Explain this run", the browser half. It is the only place AlgoLens asks an AI to look at a run, it happens
 * once per run and only when the person presses the button, and what comes back is checked against the real trace:
 *
 *   1. buildDigest   a few hundred tokens: the structures on screen, the variables, ~24 sampled steps
 *   2. requestStory  one call to the local server (which holds the prompt and the daily cap)
 *   3. checkStory    keep only the marks / chart variables / milestones that hold up against the run
 */

const BEATS = 24;
const NAME = /^[A-Za-z_$][\w$]{0,39}(?:\.[A-Za-z_$][\w$]{0,39})?$/;
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

const isShortScalar = (v) => v === null || typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 12);

/** "i=5 window_sum=42": the scalar variables of one step, the ones that just changed first. */
function scalarValues(frame) {
  const entries = Object.entries(frame.variables || {}).filter(([name, e]) => NAME.test(name) && !name.startsWith('__') && isShortScalar(e.value));
  entries.sort((a, b) => Number(b[1].changedThisFrame === true) - Number(a[1].changedThisFrame === true));
  return clip(entries.slice(0, 8).map(([name, e]) => `${name}=${e.value}`).join(' '), 120);
}

function sampleOf(entry) {
  const v = entry.value;
  if (Array.isArray(v)) return `list(${v.length})`;
  if (v !== null && typeof v === 'object') return 'dict';
  return clip(String(v), 20);
}

/** The structures the recogniser draws at a few moments of the run: these are the names the AI may point at. */
function structuresOf(model) {
  const n = model.frames.length;
  const seen = new Map();
  for (const idx of [Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1, Math.floor(n * 0.25)]) {
    for (const p of recognize(model, idx).panels) {
      if (p.lens === 'scalars' || p.lens === 'calltree') continue;
      const name = p.vars?.[0] || p.title;
      if (NAME.test(name) && !seen.has(name)) seen.set(name, { name, lens: p.lens });
    }
  }
  return [...seen.values()].slice(0, 12);
}

export function buildDigest(model, { result = null } = {}) {
  const frames = model.frames;
  const n = frames.length;
  const mid = frames[Math.floor(n / 2)] || frames[n - 1];
  const variables = Object.entries(mid?.variables || {})
    .filter(([name]) => NAME.test(name) && !name.startsWith('__'))
    .slice(0, 16)
    .map(([name, e]) => ({ name, type: e.type || typeof e.value, sample: sampleOf(e) }));
  const beats = sampleSteps(n, BEATS).map((i) => ({ i, line: frames[i].line ?? null, vals: scalarValues(frames[i]) }));
  return { structures: structuresOf(model), variables, beats, steps: n, result: result === null || result === undefined ? '' : clip(String(result), 80) };
}

/** One call. `signal` lets the caller cancel; a missing answer after 35 seconds is an error, not a hang. */
export async function requestStory({ language, code, problem, digest, runId, signal }) {
  let timeout = null;
  let guard = signal;
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    timeout = AbortSignal.timeout(35_000);
    guard = signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal || timeout;
  }
  try {
    return await apiJson('/ai/story', { body: { language, code, problem, digest, runId: runId ?? undefined }, signal: guard });
  } catch (error) {
    if (timeout?.aborted && !signal?.aborted) throw new Error('The AI took too long to answer. Try again.', { cause: error });
    throw error;
  }
}

/** Keeps what holds up against the real run; returns the story plus how much was dropped. */
export function checkStory(story, model) {
  const total = model.frames.length;
  const samples = sampleSteps(total, 60);

  // a mark must point at a structure that is really on screen at some moment, and resolve to something
  const onScreen = new Set();
  for (const idx of sampleSteps(total, 8)) {
    for (const p of recognize(model, idx).panels) (p.vars || []).forEach((v) => onScreen.add(v.replace(/^(?:self|this)\./, '')));
  }
  const candidates = story.marks.filter((m) => onScreen.has(m.on.replace(/^(?:self|this)\./, '')));
  const marks = marksThatHold(candidates, model, samples);

  const series = story.series.filter((name) => seriesFor(name, model, 4).length >= 2);
  const steps = story.steps.filter((s) => s.at < total);
  return {
    story: { ...story, marks, series, steps },
    dropped: { marks: story.marks.length - marks.length, series: story.series.length - series.length, steps: story.steps.length - steps.length },
  };
}

/** The whole flow: digest -> request -> check. */
export async function explainRun({ model, code, language, problem, result, runId, signal }) {
  const digest = buildDigest(model, { result });
  const answer = await requestStory({
    language,
    code,
    problem: problem ? { title: problem.title, description: String(problem.content || problem.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() } : null,
    digest,
    runId,
    signal,
  });
  const { story, dropped } = checkStory(answer.story, model);
  return { story, dropped, cached: Boolean(answer.cached), usage: answer.usage || null };
}
