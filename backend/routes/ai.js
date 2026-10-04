const express = require('express');
const llm = require('../services/llm');
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

module.exports = router;
