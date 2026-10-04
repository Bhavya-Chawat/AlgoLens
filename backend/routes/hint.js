const express = require('express');
const { Readable } = require('stream');
const config = require('../config');
const llm = require('../services/llm');
const { sendError } = require('./errors');

const router = express.Router();
const ROLES = new Set(['system', 'user', 'assistant']);

/** Returns an error string, or null when the payload is acceptable. */
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 8) {
    return 'messages must be a non-empty array (max 8).';
  }
  let total = 0;
  for (const m of messages) {
    if (!m || !ROLES.has(m.role) || typeof m.content !== 'string') return 'Invalid message format.';
    total += m.content.length;
  }
  return total > config.limits.hintChars ? 'Hint request is too large.' : null;
}

// Streams a Socratic hint. The prompt is built by the client from a small local "case file".
router.post('/', async (req, res) => {
  const problem = validateMessages(req.body?.messages);
  if (problem) return res.status(400).json({ error: problem });

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  try {
    const upstream = await llm.chat({
      key: llm.resolveKey(req),
      messages: req.body.messages,
      maxTokens: 500,
      stream: true,
      signal: controller.signal,
    });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  } catch (err) {
    sendError(res, err, 'Could not generate a hint.');
  }
});

module.exports = router;
module.exports.validateMessages = validateMessages;
