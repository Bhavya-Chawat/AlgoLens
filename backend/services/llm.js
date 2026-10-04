const crypto = require('crypto');
const config = require('../config');

/**
 * Thin Groq client (OpenAI-compatible API). No SDK: Node's fetch is enough.
 *
 * Design rules
 *  - The key always comes from the user (request header) – env key is a dev fallback only.
 *  - The model is *discovered* from Groq's live model list, so a deprecation (like the
 *    llama-3.3-70b-versatile shutdown) degrades to the next preferred model instead of
 *    breaking the app.
 *  - Every failure is mapped to a short, user-presentable message.
 */

// Best first. The list is only a preference: availability comes from /models.
const PREFERRED_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];

// Audio, safety and agent-wrapper models are not chat models for our purposes.
const NOT_CHAT = /whisper|orpheus|tts|guard|embed|compound|safeguard/i;

const MODEL_CACHE_MS = 30 * 60 * 1000;
const modelCache = new Map(); // keyHash -> { at, models, model }

class LLMError extends Error {
  constructor(code, message, status = 500, extra = {}) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

function keyId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/** Pure: choose the best chat model from an availability list. */
function selectModel(available, override = '') {
  const ids = (available || [])
    .filter((m) => typeof m === 'string' || m.active !== false)
    .map((m) => (typeof m === 'string' ? m : m.id))
    .filter((id) => id && !NOT_CHAT.test(id));

  if (override && ids.includes(override)) return override;
  for (const preferred of PREFERRED_MODELS) {
    if (ids.includes(preferred)) return preferred;
  }
  const generic = ids.find((id) => /gpt-oss|qwen|llama|kimi|deepseek|mistral|gemma/i.test(id));
  return generic || ids[0] || null;
}

/** gpt-oss models are reasoning models: keep reasoning short so the token budget goes to the answer. */
function modelParams(model) {
  return /^openai\/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {};
}

function resolveKey(req) {
  const header = req.headers['x-groq-key'];
  return (typeof header === 'string' && header.trim()) || config.groq.envKey || '';
}

async function groqFetch(path, key, init = {}) {
  const res = await fetch(`${config.groq.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (res.ok) return res;

  const body = await res.json().catch(() => ({}));
  const apiMessage = body?.error?.message || `HTTP ${res.status}`;
  const apiCode = body?.error?.code || '';

  if (res.status === 401) {
    throw new LLMError('invalid_key', 'Groq rejected this API key. Check it in Settings.', 401);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || null;
    const wait = retryAfter ? ` Try again in ${retryAfter}s.` : '';
    throw new LLMError('rate_limited', `Groq free-tier rate limit reached.${wait}`, 429, { retryAfter });
  }
  if (apiCode === 'model_decommissioned' || apiCode === 'model_not_found') {
    throw new LLMError('model_gone', apiMessage, 400);
  }
  throw new LLMError('upstream', apiMessage, res.status >= 500 ? 502 : res.status);
}

/** Lists chat models for this key (cached) and picks the one to use. */
async function discover(key, { force = false } = {}) {
  if (!key) throw new LLMError('no_key', 'No Groq API key set. Press "AI key" in the top bar and paste your free Groq key.', 400);
  const id = keyId(key);
  const hit = modelCache.get(id);
  if (!force && hit && Date.now() - hit.at < MODEL_CACHE_MS) return hit;

  const res = await groqFetch('/models', key, { method: 'GET' });
  const body = await res.json();
  const models = (body.data || []).filter((m) => m.active !== false && !NOT_CHAT.test(m.id));
  const model = selectModel(models, config.groq.modelOverride);
  if (!model) throw new LLMError('no_model', 'Your Groq account has no usable chat model.', 502);

  const entry = { at: Date.now(), models: models.map((m) => m.id), model };
  modelCache.set(id, entry);
  return entry;
}

/**
 * Chat completion. `stream: true` returns the raw fetch Response (SSE) for proxying.
 * Retries once with a re-discovered model if the chosen one disappeared.
 */
async function chat({ key, messages, model, maxTokens = 600, temperature = 0.2, stream = false, signal }) {
  const attempt = async (forceDiscover) => {
    const chosen = model || (await discover(key, { force: forceDiscover })).model;
    const res = await groqFetch('/chat/completions', key, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: chosen,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        stream,
        ...modelParams(chosen),
      }),
    });
    return { res, chosen };
  };

  let out;
  try {
    out = await attempt(false);
  } catch (err) {
    if (err instanceof LLMError && err.code === 'model_gone' && !model) {
      modelCache.delete(keyId(key));
      out = await attempt(true);
    } else {
      throw err;
    }
  }

  if (stream) return out.res;
  const data = await out.res.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: out.chosen,
    usage: data.usage || null,
  };
}

function clearModelCache() {
  modelCache.clear();
}

module.exports = { chat, discover, selectModel, resolveKey, clearModelCache, LLMError, PREFERRED_MODELS };
