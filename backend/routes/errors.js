const { LLMError } = require('../services/llm');

/** Sends an LLM/operational error to the client in the one shape the UI understands. */
function sendError(res, err, fallback = 'Something went wrong.') {
  if (err instanceof LLMError) {
    return res.status(err.status).json({ error: err.message, code: err.code, retryAfter: err.retryAfter ?? null });
  }
  console.error(err);
  return res.status(500).json({ error: fallback });
}

module.exports = { sendError };
