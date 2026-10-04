// Diagnostics: which panels does the recogniser produce for each example, at several points of the run?
//   node scripts/viz-report.mjs [language] [id-substring] [--all]
import { EXAMPLES } from '../src/constants/examples/index.js';
import { traceExample } from '../src/viz/testkit.js';
import { buildModel } from '../src/viz/model.js';
import { recognize } from '../src/viz/recognize.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const language = args[0] || 'python';
const filter = args[1] || '';
const showAll = process.argv.includes('--all');

for (const example of EXAMPLES) {
  if (!example[language] || !example.id.includes(filter)) continue;
  const { built, job } = await traceExample(example, language);
  const model = buildModel(built.frames, { code: job.code, language });
  const n = built.frames.length;
  const points = [0.15, 0.5, 0.85, 1].map((f) => Math.min(n - 1, Math.max(0, Math.floor(n * f) - (f === 1 ? 1 : 0))));
  const seen = new Set();
  const lines = [];
  for (const idx of points) {
    const { panels } = recognize(model, idx);
    panels.forEach((p) => seen.add(p.lens));
    lines.push(`   @${String(idx).padStart(4)}  ${panels.filter((p) => showAll || p.lens !== 'scalars').map((p) => `${p.lens}(${p.title})`).join('  ')}`);
  }
  // union over every frame: the lenses the example can ever show
  const everyLens = new Set();
  for (let idx = 0; idx < n; idx += Math.max(1, Math.floor(n / 40))) recognize(model, idx).panels.forEach((p) => everyLens.add(p.lens));
  const expects = example.expects || [];
  const has = (l) => everyLens.has(l) || (l === 'dp' && (everyLens.has('dp1') || everyLens.has('grid'))) || (l === 'array' && (everyLens.has('dp1') || everyLens.has('bars')));
  const missing = expects.filter((l) => !has(l));
  console.log(`${missing.length ? '✗' : '✓'} ${example.id}  expects [${expects.join(', ')}]${missing.length ? `  MISSING [${missing.join(', ')}]` : ''}`);
  lines.forEach((l) => console.log(l));
  console.log(`   ever: ${[...everyLens].join(', ')}`);
}
