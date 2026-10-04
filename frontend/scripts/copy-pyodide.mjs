// Copies the Pyodide runtime (Python in WebAssembly, ~13 MB) from node_modules into public/pyodide
// so the app serves it itself: Python tracing then works offline and never depends on a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const from = new URL('../node_modules/pyodide/', import.meta.url);
const to = new URL('../public/pyodide/', import.meta.url);

if (!existsSync(new URL('pyodide.mjs', from))) {
  console.warn('[copy-pyodide] pyodide is not installed yet - run `npm install` first.');
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const file of FILES) cpSync(new URL(file, from), new URL(file, to));
console.log(`[copy-pyodide] copied ${FILES.length} files to public/pyodide`);
