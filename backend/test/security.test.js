const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../server');

function request(port, { method = 'GET', path = '/api/health', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

test('API security guards', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  t.after(() => server.close());

  const good = { Host: "localhost:3000" }; // an allowed Host; the socket itself uses an ephemeral port
  const json = { 'Content-Type': 'application/json' };

  await t.test('serves requests for an allowed host', async () => {
    const res = await request(port, { headers: good });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  await t.test('rejects a foreign Host header (DNS rebinding)', async () => {
    const res = await request(port, { headers: { Host: 'evil.example:3000' } });
    assert.equal(res.status, 403);
  });

  await t.test('rejects a cross-site Origin', async () => {
    const res = await request(port, { headers: { ...good, Origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
  });

  await t.test('accepts the Vite dev origin', async () => {
    const res = await request(port, { headers: { ...good, Origin: 'http://localhost:5173' } });
    assert.equal(res.status, 200);
  });

  await t.test('rejects non-JSON POST bodies', async () => {
    const res = await request(port, {
      method: 'POST', path: '/api/leetcode/fetch',
      headers: { ...good, 'Content-Type': 'text/plain' }, body: 'x',
    });
    assert.equal(res.status, 415);
  });

  await t.test('malformed JSON is a 400, not a stack trace', async () => {
    const res = await request(port, {
      method: 'POST', path: '/api/leetcode/fetch', headers: { ...good, ...json }, body: '{bad',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Invalid JSON body.' });
  });

  await t.test('the run endpoint refuses languages it does not sandbox (Python/JS run in the browser)', async () => {
    const res = await request(port, {
      method: 'POST', path: '/api/run', headers: { ...good, ...json },
      body: { language: 'python', code: 'import os; os.system("calc")' },
    });
    assert.equal(res.status, 400);
  });

  await t.test('AI routes without a key give a friendly error', async () => {
    const saved = require('../config').groq.envKey;
    require('../config').groq.envKey = '';
    const res = await request(port, {
      method: 'POST', path: '/api/ai/validate', headers: { ...good, ...json }, body: {},
    });
    require('../config').groq.envKey = saved;
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'no_key');
  });
});

test('launch token is enforced when configured', async (t) => {
  const { createSecurity } = require('../middleware/security');
  const express = require('express');
  const app = express();
  app.use(createSecurity({ allowedHosts: new Set(['localhost:1']), allowedOrigins: [], token: 'secret-token' }));
  app.get('/x', (_q, r) => r.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const { port } = server.address();

  const noToken = await request(port, { path: '/x', headers: { Host: 'localhost:1' } });
  assert.equal(noToken.status, 401);
  const bad = await request(port, { path: '/x', headers: { Host: 'localhost:1', 'X-AlgoLens-Token': 'nope' } });
  assert.equal(bad.status, 401);
  const ok = await request(port, { path: '/x', headers: { Host: 'localhost:1', 'X-AlgoLens-Token': 'secret-token' } });
  assert.equal(ok.status, 200);
});
