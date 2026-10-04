const crypto = require('crypto');
const config = require('../config');

/**
 * "Explain this run": one small AI call, only when the user asks. The model gets the code and a short digest of the
 * REAL run (built by the browser) and answers with a few marks and one sentence, as strict JSON. It never supplies
 * data: marks are expressions ("i-k", "len(nums)-1") that the browser evaluates against the real values at every
 * step, and anything that does not hold up against the trace is dropped there.
 *
 * Everything below is plain validation, so a confused or hostile model answer can only ever be ignored.
 */

const LIMITS = {
  algorithm: 40, idea: 200, label: 14, stepText: 90, expr: 60, marks: 6, steps: 4, series: 2,
  code: 5000, problem: 400, beats: 30, variables: 16, structures: 12, beatText: 120,
};
const TONES = new Set(['accent', 'success', 'danger', 'warn']);
const LANGUAGES = new Set(['python', 'javascript', 'java', 'cpp']);
const IDENT = /^[A-Za-z_$][\w$]{0,39}(?:\.[A-Za-z_$][\w$]{0,39})?$/;
const EXPR = /^[A-Za-z0-9_$.\s+\-*\/%()&|^~<>,]{1,60}$/;

class StoryInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoryInputError';
  }
}

const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// ── the request ─────────────────────────────────────────────────────────────────────────────────
/** Validates and trims what the browser sent. Throws StoryInputError with a message for the person. */
function cleanInput(body) {
  const b = body || {};
  if (!LANGUAGES.has(b.language)) throw new StoryInputError('Unknown language.');
  if (typeof b.code !== 'string' || !b.code.trim()) throw new StoryInputError('There is no code to explain.');
  const d = b.digest;
  if (!d || typeof d !== 'object') throw new StoryInputError('The run summary is missing.');
  if (JSON.stringify(d).length > config.limits.storyChars) throw new StoryInputError('The run summary is too large.');

  const structures = (Array.isArray(d.structures) ? d.structures : []).slice(0, LIMITS.structures)
    .map((s) => ({ name: text(s?.name, 40), lens: text(s?.lens, 20) })).filter((s) => IDENT.test(s.name));
  const variables = (Array.isArray(d.variables) ? d.variables : []).slice(0, LIMITS.variables)
    .map((v) => ({ name: text(v?.name, 40), type: text(v?.type, 12), sample: text(String(v?.sample ?? ''), 40) })).filter((v) => IDENT.test(v.name));
  const beats = (Array.isArray(d.beats) ? d.beats : []).slice(0, LIMITS.beats)
    .map((x) => ({ i: Number.isInteger(x?.i) && x.i >= 0 ? x.i : null, line: Number.isInteger(x?.line) ? x.line : null, vals: text(x?.vals, LIMITS.beatText) }))
    .filter((x) => x.i !== null);
  if (!structures.length && !beats.length) throw new StoryInputError('There is nothing to explain yet.');

  return {
    language: b.language,
    code: b.code.slice(0, LIMITS.code),
    problem: b.problem && typeof b.problem === 'object' ? { title: text(b.problem.title, 80), description: text(b.problem.description, LIMITS.problem) } : null,
    digest: { structures, variables, beats, steps: Number.isInteger(d.steps) ? d.steps : beats.length, result: text(String(d.result ?? ''), 80) },
  };
}

/** Same run, same key: the answer is reused instead of asking again. */
function cacheKey(input) {
  return crypto.createHash('sha256').update(JSON.stringify([input.language, input.code, input.digest])).digest('hex');
}

// ── the prompt ──────────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You label a REAL program run for a visual debugger. Reply with ONE JSON object and nothing else.
{"algorithm":"<name, max 40 chars, e.g. Sliding window>",
 "idea":"<one sentence, max 200 chars: what the code is doing>",
 "marks":[ up to 6 of
  {"on":"<variable>","kind":"range","from":"<expr>","to":"<expr>","label":"window","tone":"accent"}
  {"on":"<variable>","kind":"cell","at":"<expr>" or ["<row expr>","<col expr>"],"label":"leaves","tone":"danger"}
  {"on":"<variable>","kind":"node","at":"<variable or expr holding a node id>","label":"current","tone":"accent"} ],
 "series":[ up to 2 numeric variable names worth charting over the whole run ],
 "steps":[ up to 4 of {"at":<step number from the run list>,"text":"<max 90 chars>"} ]}
Rules:
- "on" must be one of the listed structures. Expressions use only variables from the code, integers, + - * / // % and len(x); the app evaluates them at every step.
- Marks show the idea: the window or range being worked on, the cells read and written (DP tables), the current node (graph, union-find root). Prefer 3 to 5 marks.
- tone is accent, success, danger or warn. Labels max 14 chars. No markdown.
- Do not explain line by line and do not fix the code.
Example, fixed window of size k over nums: {"algorithm":"Sliding window","idea":"Keep the sum of k neighbours: subtract the number that leaves, add the one that enters.","marks":[{"on":"nums","kind":"range","from":"i-k+1","to":"i","label":"window","tone":"accent"},{"on":"nums","kind":"cell","at":"i-k","label":"leaves","tone":"danger"},{"on":"nums","kind":"cell","at":"i","label":"enters","tone":"success"}],"series":["window_sum"],"steps":[{"at":12,"text":"Sum jumps to a new best"}]}`;

function buildMessages(input) {
  const { digest } = input;
  const lines = [`Language: ${input.language}`];
  if (input.problem?.title) lines.push(`Problem: ${input.problem.title}${input.problem.description ? `: ${input.problem.description}` : ''}`);
  lines.push(`Code:\n${input.code}`);
  if (digest.structures.length) lines.push(`Structures on screen: ${digest.structures.map((s) => `${s.name} (${s.lens})`).join(', ')}`);
  if (digest.variables.length) lines.push(`Variables: ${digest.variables.map((v) => `${v.name} ${v.type}${v.sample ? ` e.g. ${v.sample}` : ''}`).join('; ')}`);
  if (digest.beats.length) lines.push(`The run, ${digest.steps} steps in all (step number, line, values):\n${digest.beats.map((b) => `#${b.i} L${b.line ?? '?'} ${b.vals}`).join('\n')}`);
  if (digest.result) lines.push(`Result: ${digest.result}`);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n\n') },
  ];
}

// ── the answer ──────────────────────────────────────────────────────────────────────────────────
function extractJson(raw) {
  const s = String(raw || '').replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// The only dotted names an expression may use: `self.k` / `this.k`, Math.floor(...) and friends, nums.length / x.size.
// (The browser evaluator would fail on anything else; refusing it here keeps odd text out of the story altogether.)
const DOTTED_OK = /^(?:(?:self|this)\.[A-Za-z_$][\w$]*|Math\.(?:floor|ceil|trunc|abs|min|max|round)|[A-Za-z_$][\w$]*\.(?:length|size))$/;

function expr(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!EXPR.test(s)) return null;
  for (const name of s.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/g) || []) {
    if (!DOTTED_OK.test(name)) return null;
  }
  return s;
}

function cleanMark(m) {
  if (!m || typeof m !== 'object') return null;
  const on = typeof m.on === 'string' && IDENT.test(m.on.trim()) ? m.on.trim() : null;
  if (!on) return null;
  const base = { on, label: text(m.label, LIMITS.label), tone: TONES.has(m.tone) ? m.tone : 'accent' };
  if (m.kind === 'range') {
    const from = expr(m.from);
    const to = expr(m.to);
    return from && to ? { ...base, kind: 'range', from, to } : null;
  }
  if (m.kind === 'cell') {
    const at = Array.isArray(m.at) ? m.at.slice(0, 2).map(expr) : [expr(m.at)];
    return at.length && at.every(Boolean) ? { ...base, kind: 'cell', at } : null;
  }
  if (m.kind === 'node') {
    const at = expr(m.at);
    return at ? { ...base, kind: 'node', at } : null;
  }
  return null;
}

/** The model's text -> a clean story object, or null when there is nothing usable in it. */
function parseStory(raw) {
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') return null;
  const algorithm = text(j.algorithm, LIMITS.algorithm);
  const idea = text(j.idea, LIMITS.idea);
  const marks = (Array.isArray(j.marks) ? j.marks : []).map(cleanMark).filter(Boolean).slice(0, LIMITS.marks);
  const series = (Array.isArray(j.series) ? j.series : []).filter((n) => typeof n === 'string' && IDENT.test(n.trim())).map((n) => n.trim()).slice(0, LIMITS.series);
  const steps = (Array.isArray(j.steps) ? j.steps : [])
    .map((s) => ({ at: Number.isInteger(s?.at) && s.at >= 0 ? s.at : null, text: text(s?.text, LIMITS.stepText) }))
    .filter((s) => s.at !== null && s.text).slice(0, LIMITS.steps);
  if (!algorithm && !idea && !marks.length) return null;
  return { algorithm, idea, marks, series, steps };
}

module.exports = { cleanInput, cacheKey, buildMessages, parseStory, extractJson, StoryInputError, SYSTEM_PROMPT, LIMITS };
