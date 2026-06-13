// ============================================================
// TRACE WORKER SOURCE
//
// This string is turned into a Blob URL and loaded as a
// classic Web Worker. It imports Pyodide from CDN via
// importScripts (which is only available in classic workers).
//
// Message protocol:
//   Main → Worker:
//     { type:'SETUP',  id, payload:{ pythonCode } }
//     { type:'EXECUTE',id, payload:{ code, testInput } }
//     { type:'PING',   id }
//
//   Worker → Main:
//     { type:'READY',  id }
//     { type:'RESULT', id, data: <JSON string> }
//     { type:'PROGRESS', message }
//     { type:'ERROR',  id, error: <string> }
//     { type:'PONG',   id }
// ============================================================

export const WORKER_SOURCE = `
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
const PYODIDE_INDEX = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/';

let pyodide = null;

function post(msg) {
  self.postMessage(msg);
}

async function setup(id, pythonCode) {
  try {
    post({ type: 'PROGRESS', message: 'Downloading Python runtime (first run ~10s)…' });
    self.importScripts(PYODIDE_CDN);

    post({ type: 'PROGRESS', message: 'Initialising WebAssembly environment…' });
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_INDEX });

    post({ type: 'PROGRESS', message: 'Loading tracer…' });
    pyodide.runPython(pythonCode);

    post({ type: 'READY', id });
  } catch (err) {
    post({ type: 'ERROR', id, error: 'Failed to load Python runtime: ' + (err.message || String(err)) });
  }
}

async function execute(id, editorMode, code, testInput) {
  try {
    if (!pyodide) throw new Error('Engine not initialised');

    // Pass code safely via globals (avoids any quoting/escaping issues)
    pyodide.globals.set('__editor_mode__', editorMode);
    pyodide.globals.set('__user_code__', code);
    pyodide.globals.set('__test_input__', testInput);

    const jsonStr = pyodide.runPython('algolens_run(__editor_mode__, __user_code__, __test_input__)');
    post({ type: 'RESULT', id, data: jsonStr });
  } catch (err) {
    post({ type: 'ERROR', id, error: err.message || String(err) });
  }
}

self.onmessage = async function (e) {
  const { type, id, payload } = e.data;

  if (type === 'SETUP') {
    await setup(id, payload.pythonCode);
  } else if (type === 'EXECUTE') {
    await execute(id, payload.editorMode, payload.code, payload.testInput);
  } else if (type === 'PING') {
    self.postMessage({ type: 'PONG', id });
  }
};
`;
