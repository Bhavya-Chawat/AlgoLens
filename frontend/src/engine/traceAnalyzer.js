/**
 * The prompt for an AI hint, built from the REAL trace. Every token comes out of the user's own free Groq quota, so
 * the prompt is a small case file - the code, the outcome and hard evidence (the variables at the frame where
 * something went wrong) - not the trace. Sections with nothing to say are left out, everything is capped, and
 * the rules live once, in the system prompt.
 */

export const LIMITS = { code: 6000, problem: 600, input: 300, result: 200, evidence: 260, variables: 6, findings: 3, notes: 2 };

export const HINT_SYSTEM_PROMPT = `You are AlgoLens AI, a mentor for competitive programming. You get a summary of a REAL execution of the user's code and reply with a short Socratic hint.
Rules:
1. First line, exactly: [ALGO: <algorithm paradigm, e.g. BFS, Sliding Window, Dynamic Programming, Two Pointers>].
2. If the code is correct, say "Looks good! The code is correct and should pass on LeetCode." Never invent bugs. If it is correct but slow, mention one optimisation.
3. If it fails or gives a wrong answer, give a SUBTLE hint about what goes wrong, citing variable names and "frame N" from the data. Never give the fix or corrected code.
4. Do not flag naming style, uninitialised strings or non-linear loop bounds unless they break the algorithm.
5. Plain text, no markdown, no bullets, at most 2 short paragraphs (about 4 sentences), encouraging tone.`;

/** A rough token count (about 4 characters each): enough to show the user what a hint costs. */
export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4);

const ENTITIES = { '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

export const clip = (text, max) => {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
};

/** LeetCode descriptions are HTML: the model needs the words, not the tags. */
const plainText = (html) => String(html ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:nbsp|lt|gt|amp|quot|#39);/g, (e) => ENTITIES[e])
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?)])/g, '$1')
  .trim();

const short = (value, max = 50) => clip(value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value), max);

/** "i=3, total=9, seen={...}" - the variables at one frame. */
function evidenceAt(trace, frameId) {
  const frame = trace[frameId];
  if (!frame?.variables) return '';
  const pairs = Object.entries(frame.variables).slice(0, 8).map(([name, info]) => `${name}=${short(info.value, 24)}`);
  return clip(pairs.join(', '), LIMITS.evidence);
}

/**
 * `extra` = { language, result }: the language of the run and what it really returned.
 * Returns plain data; buildPrompt() turns it into text.
 */
export function summarizeTrace(trace, code, testInput, bugs, leetcodeProblem, extra = {}) {
  const frames = trace || [];
  const summary = {
    language: extra.language || 'unknown',
    totalFrames: frames.length,
    testInput: clip(testInput || '', LIMITS.input),
    result: extra.result === null || extra.result === undefined ? null : clip(extra.result, LIMITS.result),
    callStackMaxDepth: 0,
    variableChanges: [],
    findings: [],
    notes: [],
    userCode: clip(code || 'Not provided', LIMITS.code),
    problem: leetcodeProblem ? clip(`${leetcodeProblem.title}: ${plainText(leetcodeProblem.description)}`, LIMITS.problem) : '',
  };
  if (frames.length === 0) return summary;

  for (const b of (bugs || []).slice(0, LIMITS.findings)) {
    const line = frames[b.frameId]?.line;
    const vars = evidenceAt(frames, b.frameId);
    summary.findings.push(`- ${String(b.type).replace(/_/g, ' ')}: ${b.description} (frame ${b.frameId}${line ? `, line ${line}` : ''})${vars ? ` -> ${vars}` : ''}`);
  }

  let maxDepth = 0;
  const activity = {};
  const loops = {};
  for (const f of frames) {
    if (f.callStack && f.callStack.length > maxDepth) maxDepth = f.callStack.length;
    if (f.eventType === 'loop_start') loops[f.line] = (loops[f.line] || 0) + 1;
    for (const [name, info] of Object.entries(f.variables || {})) {
      const a = activity[name] || (activity[name] = { changes: 0, final: info.value });
      if (info.changedThisFrame) a.changes += 1;
      a.final = info.value;
    }
  }
  summary.callStackMaxDepth = maxDepth;

  summary.variableChanges = Object.entries(activity)
    .sort((a, b) => b[1].changes - a[1].changes)
    .slice(0, LIMITS.variables)
    .map(([name, a]) => `${name}: ${a.changes}x, ends as ${short(a.final)}`);

  summary.notes = Object.entries(loops)
    .filter(([, count]) => count > 50)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMITS.notes)
    .map(([line, count]) => `Loop at line ${line} ran ${count} times${count > 500 ? ' (possible infinite loop)' : ''}.`);

  return summary;
}

export function buildPrompt(s) {
  const run = [`input ${s.testInput || 'none'}`];
  if (s.result !== null) run.push(`result ${s.result}`);
  run.push(`${s.totalFrames} steps`);
  if (s.callStackMaxDepth > 1) run.push(`max call depth ${s.callStackMaxDepth}`);

  const parts = [`Language: ${s.language}`];
  if (s.problem) parts.push(`Problem: ${s.problem}`);
  parts.push(`Code:\n${s.userCode}`, `Run: ${run.join(', ')}`);
  if (s.findings.length) parts.push(`Findings:\n${s.findings.join('\n')}`);
  if (s.variableChanges.length) parts.push(`Variables (times changed, final value):\n${s.variableChanges.join('\n')}`);
  if (s.notes.length) parts.push(`Notes: ${s.notes.join(' ')}`);
  return parts.join('\n\n');
}
