// The recognition engine on REAL Java and C++ traces (through the Docker sandbox): every example that exists in
// those languages must still be understood - queues, heaps, stacks, tries, DSU, DP tables ...
// Skipped when Docker or the runner images are not available.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EXAMPLES } from '../../frontend/src/constants/examples/index.js';
import { buildTrace } from '../../frontend/src/core/frameBuilder.js';
import { buildModel } from '../../frontend/src/viz/model.js';
import { recognize } from '../../frontend/src/viz/recognize.js';

const require = createRequire(import.meta.url);
const { runTrace, runnerStatus } = require('../../backend/services/exec');
const { inspect } = require('../../backend/services/inspect');
const status = await runnerStatus();
const READY = status.state === 'ready' ? status.images : {};

const FAMILY = { dp: ['dp1', 'grid'], array: ['array', 'dp1', 'bars'] };
const has = (lens, seen) => (FAMILY[lens] || [lens]).some((l) => seen.has(l));

async function run(example, language) {
  const spec = example[language];
  const args = spec.args || {};
  const mode = Object.keys(args).length ? 'function' : 'script';
  // the editor asks the server which function to call; so does this test
  const info = mode === 'function' ? await inspect(language, spec.code) : null;
  const first = info?.entries?.[0];
  const entry = first ? { className: first.className, name: first.name } : undefined;
  const wire = await runTrace({ language, code: spec.code, args, mode, entry });
  const built = buildTrace(wire, spec.code);
  const model = buildModel(built.frames, { code: spec.code, language });
  const seen = new Set();
  const n = built.frames.length;
  const step = Math.max(1, Math.floor(n / 40));
  for (let i = 0; i < n; i += step) recognize(model, i).panels.forEach((p) => seen.add(p.lens));
  if (n) recognize(model, n - 1).panels.forEach((p) => seen.add(p.lens));
  return { built, seen };
}

for (const language of ['cpp', 'java']) {
  describe(`engine on real ${language} traces`, { concurrency: 3, skip: READY[language] ? false : `${language} runner image not available` }, () => {
    for (const example of EXAMPLES.filter((e) => e[language])) {
      it(example.title, async () => {
        const { built, seen } = await run(example, language);
        assert.equal(built.error, null, built.error ? `${built.error.type}: ${built.error.message}` : '');
        assert.ok(built.frames.length > 2);
        // lenses that depend on language-specific facilities (Python's deque / heapq lists) are not required here
        const missing = (example.expects || []).filter((l) => !has(l, seen));
        assert.deepEqual(missing, [], `expected ${example.expects}, saw ${[...seen].join(', ')}`);
      });
    }
  });
}
