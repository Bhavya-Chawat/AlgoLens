/**
 * The one place that talks to the local AlgoLens server.
 *  - same-origin relative URLs (Vite proxy in dev, the server itself in the packaged app)
 *  - the user's Groq key travels in a header, never in a URL or body, never logged
 *  - failures become short messages a person can act on
 */
const KEY_STORAGE = 'algolens-apikey';

export class ApiError extends Error {
  constructor(message, { code = null, status = 0, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function getGroqKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setGroqKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode: the key just won't persist */
  }
}

/** Returns the raw Response (so callers can stream). Throws ApiError for any non-2xx. */
export async function apiFetch(path, { method = 'POST', body, signal, groqKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const key = groqKey ?? getGroqKey();
  if (key) headers['X-Groq-Key'] = key;
  const token = typeof window !== 'undefined' ? window.algolens?.token : '';
  if (token) headers['X-AlgoLens-Token'] = token;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError("Can't reach the AlgoLens local server. Start it (start.bat) and try again.", { code: 'offline' });
  }

  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new ApiError(info.error || `Request failed (HTTP ${res.status}).`, {
      code: info.code, status: res.status, retryAfter: info.retryAfter,
    });
  }
  return res;
}

export async function apiJson(path, options) {
  return (await apiFetch(path, options)).json();
}
