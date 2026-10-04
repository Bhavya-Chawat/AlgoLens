import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXAMPLES } from '../../constants/examples/index.js';
import { traceExample } from '../testkit.js';
import { buildModel } from '../model.js';
import { recognize } from '../recognize.js';

// Smoke test of the whole visual layer: every lens, for every example, at many points of the run, rendered
// on the server. A lens that throws (missing field, bad index, NaN layout) fails here, not in front of a user.

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.resolve(here, '../../../node_modules/.cache/algolens-test');
mkdirSync(cacheDir, { recursive: true });
const outfile = path.join(cacheDir, 'stage.mjs');

await build({
  root: path.resolve(here, '../../..'),
  logLevel: 'silent',
  build: {
    ssr: path.join(here, 'Stage.jsx'),
    outDir: cacheDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'esm', entryFileNames: 'stage.mjs' } },
  },
});
const { default: Stage } = await import(pathToFileURL(outfile).href);

function renderAt(model, language, idx) {
  const result = recognize(model, idx);
  const html = renderToStaticMarkup(createElement(Stage, { result, model, language, frameIdx: idx }));
  return { result, html };
}

for (const example of EXAMPLES) {
  test(`renders: ${example.title}`, async () => {
    const language = example.python ? 'python' : 'javascript';
    const { built, job } = await traceExample(example, language);
    const model = buildModel(built.frames, { code: job.code, language });
    const n = built.frames.length;
    const step = Math.max(1, Math.floor(n / 25));
    let drawn = 0;
    for (let idx = 0; idx < n; idx += step) {
      const { result, html } = renderAt(model, language, idx);
      assert.ok(html.includes('vz-stage'), `frame ${idx} produced no stage`);
      assert.ok(!/NaN|undefined|\[object Object\]/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')), `frame ${idx}: ${(html.match(/.{40}(NaN|undefined|\[object Object\]).{20}/) || [''])[0]}`);
      if (result.panels.some((p) => p.lens !== 'scalars')) {
        drawn += 1;
        assert.ok(html.includes('vz-card'), `frame ${idx}: a structure was recognised but no card was drawn`);
        assert.ok(html.includes('<svg') || html.includes('vz-cell') || html.includes('vz-table'), `frame ${idx}: card has no content`);
      }
    }
    renderAt(model, language, n - 1);
    assert.ok(drawn > 0, 'at least one structure was drawn');
  });
}
