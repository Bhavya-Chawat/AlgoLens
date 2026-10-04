const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../services/llm');
const { validateMessages } = require('../routes/hint');

const model = (id, extra = {}) => ({ id, active: true, ...extra });

test('selectModel prefers the ranked list and skips non-chat models', () => {
  const available = [model('whisper-large-v3'), model('openai/gpt-oss-20b'), model('openai/gpt-oss-120b'), model('qwen/qwen3.8-27b')];
  assert.equal(llm.selectModel(available), 'openai/gpt-oss-120b');
});

test('selectModel survives the shutdown of a preferred model', () => {
  // llama-3.3-70b-versatile and gpt-oss-120b both gone -> next preference wins
  const available = [model('qwen/qwen3.8-27b'), model('openai/gpt-oss-20b')];
  assert.equal(llm.selectModel(available), 'qwen/qwen3.8-27b');
});

test('selectModel falls back to any chat-capable model and ignores inactive ones', () => {
  assert.equal(llm.selectModel([model('some/llama-9', { active: false }), model('acme/llama-10')]), 'acme/llama-10');
  assert.equal(llm.selectModel([model('whisper-large-v3'), model('playai-tts')]), null);
});

test('selectModel honours an override only if it is available', () => {
  const available = [model('openai/gpt-oss-120b'), model('openai/gpt-oss-20b')];
  assert.equal(llm.selectModel(available, 'openai/gpt-oss-20b'), 'openai/gpt-oss-20b');
  assert.equal(llm.selectModel(available, 'gone/model'), 'openai/gpt-oss-120b');
});

function mockFetch(handler) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return { calls, restore: () => (global.fetch = original) };
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('chat discovers a model, calls it, and reports usage', async () => {
  llm.clearModelCache();
  const m = mockFetch((url) =>
    url.endsWith('/models')
      ? json(200, { data: [model('openai/gpt-oss-120b')] })
      : json(200, { choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 7 } }));
  try {
    const out = await llm.chat({ key: 'k1', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.content, 'hello');
    assert.equal(out.model, 'openai/gpt-oss-120b');
    const body = JSON.parse(m.calls[1].init.body);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.max_completion_tokens, 600);
  } finally { m.restore(); }
});

test('chat re-discovers the model when the chosen one was decommissioned', async () => {
  llm.clearModelCache();
  let completions = 0;
  const m = mockFetch((url) => {
    if (url.endsWith('/models')) {
      return json(200, { data: [model(completions === 0 ? 'openai/gpt-oss-120b' : 'qwen/qwen3.8-27b')] });
    }
    completions += 1;
    return completions === 1
      ? json(400, { error: { code: 'model_decommissioned', message: 'gone' } })
      : json(200, { choices: [{ message: { content: 'ok' } }] });
  });
  try {
    const out = await llm.chat({ key: 'k2', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.model, 'qwen/qwen3.8-27b');
    assert.equal(out.content, 'ok');
  } finally { m.restore(); }
});

test('chat maps 401 and 429 to friendly errors', async () => {
  llm.clearModelCache();
  let m = mockFetch(() => json(401, { error: { message: 'bad' } }));
  try {
    await assert.rejects(llm.chat({ key: 'k3', messages: [] }), (e) => e.code === 'invalid_key' && e.status === 401);
  } finally { m.restore(); }

  llm.clearModelCache();
  m = mockFetch((url) => (url.endsWith('/models')
    ? json(200, { data: [model('openai/gpt-oss-120b')] })
    : json(429, { error: { message: 'slow down' } }, { 'retry-after': '12' })));
  try {
    await assert.rejects(llm.chat({ key: 'k4', messages: [] }), (e) => e.code === 'rate_limited' && e.retryAfter === 12);
  } finally { m.restore(); }
});

test('chat without a key fails before touching the network', async () => {
  const m = mockFetch(() => { throw new Error('network must not be used'); });
  try {
    await assert.rejects(llm.chat({ key: '', messages: [] }), (e) => e.code === 'no_key');
  } finally { m.restore(); }
});

test('hint payload validation', () => {
  assert.equal(validateMessages([{ role: 'user', content: 'x' }]), null);
  assert.ok(validateMessages([]));
  assert.ok(validateMessages([{ role: 'hacker', content: 'x' }]));
  assert.ok(validateMessages([{ role: 'user', content: 'x'.repeat(30_000) }]));
});
