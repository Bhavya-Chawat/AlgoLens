const express = require('express');
const config = require('../config');
const { inspect, SUPPORTED } = require('../services/inspect');
const { runTrace, runnerStatus, ensureImage, RunnerUnavailable, JobError, LANGUAGES } = require('../services/exec');

const router = express.Router();

/** Entry points / parameters of Java or C++ code (parsed locally, instant, no AI). */
router.post('/inspect', async (req, res) => {
  const { language, code } = req.body || {};
  if (!SUPPORTED.includes(language)) return res.status(400).json({ error: `${language} is inspected in the browser.` });
  if (typeof code !== 'string' || code.length > config.limits.codeChars) return res.status(400).json({ error: 'Invalid code.' });
  try {
    res.json(await inspect(language, code));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not read the code structure.' });
  }
});

/** Really runs Java/C++ in the sandbox and returns the recorded trace. */
router.post('/run', async (req, res) => {
  try {
    res.json(await runTrace(req.body));
  } catch (error) {
    if (error instanceof RunnerUnavailable) {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    if (error instanceof JobError) return res.status(400).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'The runner failed unexpectedly.' });
  }
});

router.get('/runner/status', async (_req, res) => {
  res.json(await runnerStatus());
});

/** Downloads/builds a runner image, streaming progress lines (used by the setup screen). */
router.post('/runner/prepare', async (req, res) => {
  const language = req.body?.language;
  if (!LANGUAGES.has(language)) return res.status(400).json({ error: 'Unknown language.' });
  res.setHeader('Content-Type', 'application/x-ndjson');
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  try {
    await ensureImage(language, (message) => send({ progress: message }));
    send({ done: true });
  } catch (error) {
    send({ error: error.message, code: error.code || 'failed' });
  }
  res.end();
});

module.exports = router;
