const express = require('express');
const config = require('../config');
const llm = require('../services/llm');
const story = require('../services/story');
const store = require('../services/store');
const { sendError } = require('./errors');

const router = express.Router();

// Checks a key without spending tokens (lists models) and reports which model will be used.
router.post('/validate', async (req, res) => {
  try {
    const { model, models } = await llm.discover(llm.resolveKey(req), { force: true });
    res.json({ ok: true, model, models });
  } catch (err) {
    sendError(res, err, 'Could not validate the key.');
  }
});

// Signed-out use keeps answers in memory only (a few, newest first); signed-in answers go to the database.
const memory = new Map();
const MEMORY_MAX = 100;
function remember(key, value) {
  memory.set(key, value);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

/**
 * Explain this run: ONE model call, only when the user presses the button. The answer is small JSON (an algorithm
 * name, one sentence, a few marks, a chart, a few milestones) that the browser checks against the real trace.
 */
router.post('/story', async (req, res) => {
  let input;
  try {
    input = story.cleanInput(req.body);
  } catch (error) {
    if (error instanceof story.StoryInputError) return res.status(400).json({ error: error.message });
    throw error;
  }

  const user = req.user;
  const key = story.cacheKey(input);
  const runId = Number.isInteger(req.body?.runId) ? req.body.runId : null;
  const label = (found) => {
    if (user && runId !== null && found.algorithm) {
      try { store.setRunAlgorithm(user.id, runId, found.algorithm); } catch (error) { console.error(error); }
    }
  };

  try {
    const cached = user ? store.getCachedStory(user.id, key) : memory.get(key);
    if (cached) {
      label(cached);
      return res.json({ story: cached, cached: true });
    }

    if (user && store.aiCallsToday(user.id) >= config.ai.dailyLimit) {
      return res.status(429).json({
        error: `You have used today's ${config.ai.dailyLimit} AI explanations. They come back tomorrow, and runs you already explained stay free.`,
        code: 'daily_limit',
      });
    }

    const out = await llm.chat({
      key: llm.resolveKey(req),
      messages: story.buildMessages(input),
      maxTokens: 700,
      temperature: 0.1,
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
    const parsed = story.parseStory(out.content);
    if (!parsed) return res.status(502).json({ error: 'The AI did not give a usable explanation. Try again.', code: 'bad_story' });

    if (user) {
      store.putCachedStory(user.id, key, parsed);
      store.countAiCall(user.id, out.usage?.total_tokens || 0);
    } else {
      remember(key, parsed);
    }
    label(parsed);
    res.json({ story: parsed, cached: false, model: out.model, usage: out.usage });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return res.status(504).json({ error: 'The AI took too long to answer. Try again.', code: 'timeout' });
    }
    sendError(res, error, 'Could not explain this run.');
  }
});

module.exports = router;
