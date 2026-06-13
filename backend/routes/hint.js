const express = require('express');
const router = express.Router();
const { Readable } = require('stream');

router.post('/', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;
    
    // Fallback to backend ENV key if custom key is not provided
    const effectiveKey = apiKey || process.env.GROQ_API_KEY;

    if (!effectiveKey) {
      return res.status(400).json({ error: "No API key available. Set GROQ_API_KEY in .env or provide a custom key in the frontend." });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        stream: true,
        temperature: 0.1,
        max_tokens: 1000,
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errJson.error?.message || `HTTP ${response.status}` });
    }

    // Proxy the stream back to the frontend
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }

  } catch (error) {
    console.error('Hint route error:', error);
    res.status(500).json({ error: 'Internal server error generating hint' });
  }
});

module.exports = router;
