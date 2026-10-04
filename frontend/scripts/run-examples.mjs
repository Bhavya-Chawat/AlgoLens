// Diagnostics: run every example through its in-process tracer and print what came out.
//   node scripts/run-examples.mjs [language] [id-substring]
import { EXAMPLES } from '../src/constants/examples/index.js';
import { traceExample } from '../src/viz/testkit.js';

const language = process.argv[2] || 'python';
const filter = process.argv[3] || '';

let bad = 0;
for (const example of EXAMPLES) {
  if (!example[language] || !example.id.includes(filter)) continue;
  const started = Date.now();
  try {
    const { built } = await traceExample(example, language);
    const names = new Map();
    for (const f of built.frames) for (const [name, e] of Object.entries(f.variables)) if (!names.has(name)) names.set(name, e.type);
    const err = built.error ? `ERROR ${built.error.type}: ${built.error.message}` : 'ok';
    if (built.error) bad += 1;
    console.log(`${example.id.padEnd(24)} ${String(built.frames.length).padStart(5)} frames ${String(Date.now() - started).padStart(5)}ms  ${err}${built.truncated ? ' (truncated)' : ''}`);
    if (process.env.VARS) console.log('   ', [...names].map(([n, t]) => `${n}:${t}`).join('  '));
    if (process.env.RESULT) console.log('    result:', built.result);
  } catch (e) {
    bad += 1;
    console.log(`${example.id.padEnd(24)} CRASH ${e.message}`);
  }
}
console.log(bad ? `\n${bad} example(s) failed` : '\nall examples ran');
process.exit(bad ? 1 : 0);
