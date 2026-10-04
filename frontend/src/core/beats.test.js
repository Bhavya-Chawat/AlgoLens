import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPyodide } from 'pyodide';
import { runJs } from '../tracers/javascript/run.js';
import { buildTrace } from './frameBuilder.js';
import {
  computeLoopExtents, buildOutline, planVisible, itemIndexFor, stepFrame, foldsToReveal, representativeFrame,
} from './beats.js';

const py = await loadPyodide();
py.runPython(readFileSync(new URL('../tracers/python/tracer.py', import.meta.url), 'utf8'));
const tracePy = (code, job = {}) => buildTrace(JSON.parse(py.globals.get('algolens_run')(JSON.stringify({ code, ...job }))), code);
const traceJs = (code, job = {}) => buildTrace(runJs({ code, ...job }), code);

const range = (item) => (item.type === 'frame' ? [item.index, item.index] : [item.start, item.end]);

/** The core promise: whatever is folded, every frame is covered exactly once, in order. */
function assertPartition(items, total) {
  let expected = 0;
  for (const item of items) {
    const [s, e] = range(item);
    assert.equal(s, expected, `gap or overlap before item starting at ${s}`);
    expected = e + 1;
  }
  assert.equal(expected, total, 'items must cover every frame');
}

const plan = (built, source, opts = {}) => {
  const outline = buildOutline(built.frames, source);
  return planVisible(outline, { total: built.frames.length, bugFrames: built.bugs.map((b) => b.frameId), ...opts });
};

const SUM = 'def total(n):\n    s = 0\n    for i in range(n):\n        s += i\n    return s\n';

test('loop extents come from indentation and braces (Python, K&R, Allman, do/while)', () => {
  const py1 = computeLoopExtents('def f():\n    for i in x:\n        a()\n        b()\n    c()\n');
  assert.equal(py1.get(2), 4);
  const kr = computeLoopExtents('void f() {\n  for (int i=0;i<3;i++) {\n    a();\n  }\n  b();\n}\n');
  assert.equal(kr.get(2), 4);
  const allman = computeLoopExtents('void f()\n{\n  while (x)\n  {\n    a();\n  }\n  b();\n}\n');
  assert.equal(allman.get(3), 6);
  const dw = computeLoopExtents('void f() {\n  do {\n    a();\n  } while (x);\n  b();\n}\n');
  assert.equal(dw.get(2), 4);
  assert.equal(dw.has(4), false); // the `} while` tail is not a header of its own
});

test('short traces are shown in full (nothing to fold)', () => {
  const built = tracePy(SUM, { args: { n: 4 } });
  const items = plan(built, SUM);
  assert.ok(items.every((i) => i.type === 'frame'));
  assertPartition(items, built.frames.length);
});

test('a long loop of identical iterations folds to: first, xN chip, last', () => {
  const built = tracePy(SUM, { args: { n: 60 } });
  assert.ok(built.frames.length > 100);
  const items = plan(built, SUM);
  assertPartition(items, built.frames.length);
  const folds = items.filter((i) => i.type === 'fold');
  assert.equal(folds.length, 1);
  assert.equal(folds[0].count, 58); // 60 iterations: first + last stay visible
  assert.ok(items.length < 30, `overview should be short, got ${items.length}`);
  assert.match(folds[0].label, /for i in range\(n\)/);
});

test('an iteration that behaves differently stays open', () => {
  const code = 'def f(n):\n    s = 0\n    for i in range(n):\n        if i == 25:\n            s += 100\n        s += 1\n    return s\n';
  const built = tracePy(code, { args: { n: 50 } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  const folds = items.filter((i) => i.type === 'fold');
  assert.ok(folds.length >= 2, 'a fold before and a fold after the special iteration');
  const special = built.frames.findIndex((f) => f.line === 5);
  assert.ok(items.some((i) => i.type === 'frame' && i.index === special), 'the i == 25 body line is visible');
});

test('a bug frame inside a loop is never folded away', () => {
  const code = 'def f(a):\n    s = 0\n    for i in range(len(a) + 1):\n        s += a[i]\n    return s\n';
  const built = tracePy(code, { args: { a: list(40) } });
  assert.ok(built.bugs.length === 1);
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  const bug = built.bugs[0].frameId;
  assert.ok(items.some((i) => i.type === 'frame' && i.index === bug));
});

function list(n) {
  return Array.from({ length: n }, (_, i) => i);
}

test('expanding a fold reveals every iteration it hid, and still partitions the trace', () => {
  const built = tracePy(SUM, { args: { n: 60 } });
  const folded = plan(built, SUM);
  const fold = folded.find((i) => i.type === 'fold');
  const opened = plan(built, SUM, { expanded: new Set([fold.id]) });
  assertPartition(opened, built.frames.length);
  assert.ok(opened.every((i) => i.type === 'frame'));
  assert.equal(opened.length, built.frames.length);
});

test('detail "full" never folds; "overview" folds even short-ish traces', () => {
  const built = tracePy(SUM, { args: { n: 60 } });
  const full = plan(built, SUM, { detail: 'full' });
  assert.equal(full.length, built.frames.length);
  const overview = plan(built, SUM, { detail: 'overview' });
  assert.ok(overview.length < full.length);
});

test('bubble sort: partition holds and the overview is far shorter than the raw trace', () => {
  const code = `def bubble(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
`;
  const arr = Array.from({ length: 20 }, (_, i) => (i * 7) % 20);
  const built = tracePy(code, { args: { arr } });
  assert.deepEqual(built.resultRaw, list(20));
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  assert.ok(built.frames.length > 400, `raw trace is long (${built.frames.length})`);
  assert.ok(items.length < built.frames.length * 0.5, `overview ${items.length} vs raw ${built.frames.length}`);
});

test('nested loops of identical work fold on both levels', () => {
  const code = 'def f(n):\n    s = 0\n    for i in range(n):\n        for j in range(n):\n            s += 1\n    return s\n';
  const built = tracePy(code, { args: { n: 12 } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  assert.ok(items.length < 60, `got ${items.length}`);
  assert.ok(items.some((i) => i.type === 'fold'));
});

test('exhausted Python for-loop header is not counted as an iteration', () => {
  const built = tracePy(SUM, { args: { n: 6 } });
  const loop = buildOutline(built.frames, SUM).nodes.flatMap((n) => (n.kind === 'call' ? n.children : [n])).find((n) => n.kind === 'loop');
  assert.equal(loop.count, 6);
  assert.equal(loop.children.at(-1).exit, true);
});

test('recursion: deep call trees fold in overview, and stay partitioned', () => {
  const code = 'def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n';
  const built = tracePy(code, { args: { n: 14 } });
  assert.ok(built.frames.length > 1500);
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  assert.ok(items.length < built.frames.length / 3);
  assert.ok(items.some((i) => i.type === 'fold' && i.kind === 'call'));
});

test('works for JavaScript traces too', () => {
  const code = 'function total(n) {\n  let s = 0;\n  for (let i = 0; i < n; i++) {\n    s += i;\n  }\n  return s;\n}\n';
  const built = traceJs(code, { args: { n: 50 } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  const fold = items.find((i) => i.type === 'fold');
  assert.ok(fold && fold.count === 48);
});

test('stepping walks plan items; a fold lands on the state after it; reveal opens the right fold', () => {
  const built = tracePy(SUM, { args: { n: 60 } });
  const items = plan(built, SUM);
  const foldAt = items.findIndex((i) => i.type === 'fold');
  const before = representativeFrame(items[foldAt - 1]);
  const landed = stepFrame(items, before, 1);
  assert.equal(landed, items[foldAt].end);
  assert.equal(itemIndexFor(items, landed), foldAt);
  assert.equal(stepFrame(items, landed, 1), representativeFrame(items[foldAt + 1]));
  assert.equal(stepFrame(items, 0, -1), 0);
  assert.equal(stepFrame(items, built.frames.length - 1, 1), built.frames.length - 1);

  const inside = items[foldAt].start + 3;
  assert.deepEqual(foldsToReveal(items, inside), [items[foldAt].id]);
  assert.deepEqual(foldsToReveal(items, 0), []);
});

test('a fold always hides at least three iterations (never a pointless chip)', () => {
  const code = `def bubble(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
`;
  const arr = Array.from({ length: 20 }, (_, i) => (i * 7) % 20);
  const built = tracePy(code, { args: { arr } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  const folds = items.filter((i) => i.type === 'fold' && i.kind === 'loop');
  assert.ok(folds.length > 0);
  assert.ok(folds.every((f) => f.count >= 3), `folds: ${folds.map((f) => f.count)}`);
});

test('bubble sort: every outer pass stays visible (the inner loop shrinks each pass)', () => {
  const code = `def bubble(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
`;
  const arr = Array.from({ length: 20 }, (_, i) => (i * 7) % 20);
  const built = tracePy(code, { args: { arr } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  const visible = new Set(items.filter((i) => i.type === 'frame').map((i) => i.index));
  // every execution of the outer `for i` line is shown individually
  const outerHeaders = built.frames.filter((f) => f.line === 3 && f.eventType === 'loop_start').map((f) => f.id);
  assert.equal(outerHeaders.length, 21); // 20 passes + the exhausted-iterator check
  assert.ok(outerHeaders.every((id) => visible.has(id)), 'no outer pass may be folded away');
});

test('identical nested work still folds on the outer level', () => {
  const code = 'def f(n):\n    s = 0\n    for i in range(n):\n        for j in range(4):\n            s += 1\n    return s\n';
  const built = tracePy(code, { args: { n: 30 } });
  const items = plan(built, code);
  assertPartition(items, built.frames.length);
  assert.ok(items.some((i) => i.type === 'fold' && i.count >= 20), 'the middle outer iterations fold together');
});
