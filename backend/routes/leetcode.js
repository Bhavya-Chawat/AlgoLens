const express = require('express');
const { extractSlug, fetchProblem } = require('../services/leetcode');

const router = express.Router();

router.post('/fetch', async (req, res) => {
  const slug = extractSlug(req.body?.url);
  if (!slug) {
    return res.status(400).json({ error: 'Paste a LeetCode problem URL, e.g. https://leetcode.com/problems/two-sum/' });
  }
  try {
    res.json(await fetchProblem(slug));
  } catch (error) {
    // Network/LeetCode failures are expected operational errors, not server bugs.
    res.status(502).json({ error: error.message || 'Could not reach LeetCode.' });
  }
});

module.exports = router;
