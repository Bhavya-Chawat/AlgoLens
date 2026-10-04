// Test helpers shared by the viz tests: run any example through the real tracer of its language.
// Python goes through Pyodide, JavaScript through the in-process instrumenter. Java and C++ need the Docker
// sandbox, so their tests live next to the runners (runner/java/test, runner/cpp/test).
import { readFileSync } from 'node:fs';
import { loadPyodide } from 'pyodide';
import { runJs } from '../tracers/javascript/run.js';
import { buildTrace } from '../core/frameBuilder.js';

let pyodide = null;

async function python() {
  if (!pyodide) {
    pyodide = await loadPyodide();
    pyodide.runPython(readFileSync(new URL('../tracers/python/tracer.py', import.meta.url), 'utf8'));
  }
  return pyodide;
}

/** Same decision the editor makes: arguments given -> call the entry function, otherwise run as a script. */
export function jobFor(example, language) {
  const spec = example[language];
  const args = spec.args || {};
  const hasArgs = Object.keys(args).length > 0;
  return { code: spec.code, args, mode: hasArgs ? 'function' : 'script', entry: spec.entry ? { name: spec.entry } : undefined };
}

export async function traceExample(example, language = 'python') {
  const job = jobFor(example, language);
  let wire;
  if (language === 'python') {
    const py = await python();
    wire = JSON.parse(py.globals.get('algolens_run')(JSON.stringify(job)));
  } else if (language === 'javascript') {
    wire = runJs(job);
  } else {
    throw new Error(`no in-process tracer for ${language}`);
  }
  return { wire, built: buildTrace(wire, job.code), job };
}
