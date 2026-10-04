/* Runs Pyodide (CPython compiled to WebAssembly) off the main thread. */
import TRACER_SOURCE from './tracer.py?raw';

let pyodide = null;
const post = (message) => self.postMessage(message);

async function init({ base }) {
  post({ type: 'progress', message: 'Loading Python runtime…' });
  // The runtime is served by the app itself (public/pyodide) - no CDN, works offline.
  const { loadPyodide } = await import(/* @vite-ignore */ `${base}pyodide/pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: `${base}pyodide/` });
  pyodide.runPython(TRACER_SOURCE);
}

function callPython(name, arg) {
  const fn = pyodide.globals.get(name);
  try {
    return fn(arg);
  } finally {
    fn.destroy();
  }
}

self.onmessage = async ({ data }) => {
  const { type, id, payload } = data;
  try {
    let result = true;
    if (type === 'init') await init(payload);
    else if (type === 'run') result = callPython('algolens_run', JSON.stringify(payload.job));
    else if (type === 'inspect') result = callPython('algolens_inspect', payload.code);
    post({ type: 'result', id, result });
  } catch (error) {
    post({ type: 'error', id, error: error?.message || String(error) });
  }
};
