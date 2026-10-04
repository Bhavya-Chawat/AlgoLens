import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_SYSTEM_PROMPT, LIMITS, buildPrompt, estimateTokens, summarizeTrace } from './traceAnalyzer.js';

const frame = (i, line, vars = {}, extra = {}) => ({
  id: i, line, eventType: 'line', callStack: [{ name: 'f' }],
  variables: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, { value: v, type: typeof v, changedThisFrame: true }])),
  ...extra,
});

const small = [frame(0, 3, { i: 0 }), frame(1, 4, { i: 1, total: 1 }), frame(2, 4, { i: 2, total: 3 })];

test('the case file carries the real language, result and the evidence at the failing frame', () => {
  const bugs = [{ frameId: 2, type: 'index_error', description: 'IndexError: list index out of range', severity: 'error' }];
  const s = summarizeTrace(small, 'def f(a): pass', '{"a":[1]}', bugs, null, { language: 'python', result: '3' });
  const text = buildPrompt(s);
  assert.match(text, /^Language: python/);
  assert.match(text, /result 3/);
  assert.match(text, /index error: IndexError: list index out of range \(frame 2, line 4\) -> i=2, total=3/);
  assert.doesNotMatch(text, /unknown|Python\/Java/);
});

test('sections with nothing to say are left out', () => {
  const text = buildPrompt(summarizeTrace([], 'x = 1', '', [], null, { language: 'cpp' }));
  assert.doesNotMatch(text, /Findings|Notes|Problem:|Variables/);
  assert.match(text, /Run: input none, 0 steps/);
});

test('problem text is plain words, capped', () => {
  const problem = { title: 'Two Sum', description: `<p>Given an array &lt;nums&gt; of integers${' and more words'.repeat(200)}</p><ul><li>x</li></ul>` };
  const s = summarizeTrace(small, 'code', '{}', [], problem, { language: 'java' });
  assert.match(s.problem, /^Two Sum: Given an array <nums> of integers/);
  assert.doesNotMatch(s.problem, /<p>|<li>|&lt;/);
  assert.ok(s.problem.length <= LIMITS.problem);
});

test('a huge program and a huge trace still fit a small, fixed budget', () => {
  const bigVars = { xs: Array.from({ length: 500 }, (_, i) => i), m: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, i])) };
  const trace = Array.from({ length: 5000 }, (_, i) => frame(i, (i % 40) + 1, { ...bigVars, i }, i % 40 === 0 ? { eventType: 'loop_start' } : {}));
  const bugs = Array.from({ length: 10 }, (_, i) => ({ frameId: i * 100, type: 'infinite_loop', description: 'x'.repeat(200), severity: 'warning' }));
  const code = 'int x = 0;\n'.repeat(5000);
  const problem = { title: 'T', description: 'word '.repeat(2000) };
  const text = buildPrompt(summarizeTrace(trace, code, JSON.stringify({ xs: bigVars.xs }), bugs, problem, { language: 'cpp', result: 'r'.repeat(900) }));
  assert.ok(text.length < 9000, `prompt is ${text.length} chars`);
  assert.ok(estimateTokens(text) < 2300);
  assert.equal(text.split('\n- ').length - 1 <= LIMITS.findings, true, 'at most three findings');
  assert.ok(summarizeTrace(trace, code, '', bugs, null).variableChanges.length <= LIMITS.variables);
});

test('the rules are stated once and are short', () => {
  assert.ok(HINT_SYSTEM_PROMPT.length < 1100, `system prompt is ${HINT_SYSTEM_PROMPT.length} chars`);
  assert.match(HINT_SYSTEM_PROMPT, /\[ALGO:/);
  assert.match(HINT_SYSTEM_PROMPT, /Never give the fix/);
  assert.match(HINT_SYSTEM_PROMPT, /Looks good!/);
  assert.doesNotMatch(buildPrompt(summarizeTrace(small, 'c', '', [], null, { language: 'python' })), /CRITICAL RULES|Do NOT provide/);
});

test('only genuinely long loops are mentioned', () => {
  const trace = [
    ...Array.from({ length: 60 }, (_, i) => frame(i, 5, { i }, { eventType: 'loop_start' })),
    ...Array.from({ length: 3 }, (_, i) => frame(100 + i, 9, { j: i }, { eventType: 'loop_start' })),
  ];
  const s = summarizeTrace(trace, 'c', '', [], null, { language: 'python' });
  assert.deepEqual(s.notes, ['Loop at line 5 ran 60 times.']);
});

test('estimateTokens is about four characters per token', () => {
  assert.equal(estimateTokens('a'.repeat(400)), 100);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(undefined), 0);
});
