const express = require('express');
const router = express.Router();
const { getTrace } = require('../services/traceEngine');

router.post('/', async (req, res) => {
  try {
    const { language, code, testInput, apiKey, judge0ApiKey } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'Language and code are required.' });
    }

    const result = await getTrace(language, code, testInput, apiKey, judge0ApiKey);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      frames: result.frames,
      bugs: [] // Bugs detection can be implemented via another LLM pass if needed
    });

  } catch (error) {
    console.error('Execute route error:', error);
    res.status(500).json({ error: 'Internal server error during execution' });
  }
});

module.exports = router;
