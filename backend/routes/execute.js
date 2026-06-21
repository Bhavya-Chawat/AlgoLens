const express = require('express');
const router = express.Router();
const { getTrace, expandTrace } = require('../services/traceEngine');
const { runCustomCode } = require('../services/executionService');

router.post('/', async (req, res) => {
  try {
    const { editorMode, language, code, testInput, apiKey, judge0ApiKey, traceDepth } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'Language and code are required.' });
    }

    let executionOutput = null;

    if (editorMode === 'custom') {
      const execResult = await runCustomCode(language, code, testInput, judge0ApiKey);
      if (!execResult.success) {
        // Return compilation error immediately, skipping AI trace
        return res.status(400).json({ error: execResult.error.message + '\n\n' + execResult.error.details });
      }
      executionOutput = execResult.stdout;
    }

    const result = await getTrace(editorMode, language, code, testInput, apiKey, judge0ApiKey, traceDepth);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      frames: result.frames,
      bugs: [], 
      result: executionOutput || result.result,
      algorithmName: result.algorithmName,
      isSummarized: result.isSummarized,
      tokenUsage: result.tokenUsage
    });

  } catch (error) {
    console.error('Execute route error:', error);
    res.status(500).json({ error: 'Internal server error during execution' });
  }
});

router.post('/expand', async (req, res) => {
  try {
    const { editorMode, language, code, testInput, apiKey, judge0ApiKey, startFrame, endFrame } = req.body;

    if (!language || !code || !startFrame || !endFrame) {
      return res.status(400).json({ error: 'Language, code, startFrame, and endFrame are required.' });
    }

    const result = await expandTrace(editorMode, language, code, testInput, apiKey, judge0ApiKey, startFrame, endFrame);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      frames: result.frames,
      tokenUsage: result.tokenUsage
    });

  } catch (error) {
    console.error('Expand route error:', error);
    res.status(500).json({ error: 'Internal server error during trace expansion' });
  }
});

module.exports = router;
