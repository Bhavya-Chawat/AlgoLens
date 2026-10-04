const express = require('express');
const store = require('../services/store');
const { requireUser } = require('../middleware/session');

const router = express.Router();
router.use(requireUser);

function fail(res, error) {
  if (error instanceof store.StoreError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: 'Could not reach your saved data.' });
}

/** One call after a run: saves the run and its code (once per distinct code). */
router.post('/runs', (req, res) => {
  try {
    res.status(201).json(store.saveRun(req.user.id, req.body));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/runs', (req, res) => {
  try {
    res.json({ runs: store.listRuns(req.user.id, req.query.limit) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/solutions', (req, res) => {
  try {
    res.json({ solutions: store.listSolutions(req.user.id, req.query.limit) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/solutions/:id', (req, res) => {
  try {
    const solution = store.getSolution(req.user.id, req.params.id);
    if (!solution) return res.status(404).json({ error: 'That solution is not in your history.' });
    res.json({ solution });
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/solutions/:id', (req, res) => {
  try {
    if (!store.deleteSolution(req.user.id, req.params.id)) return res.status(404).json({ error: 'That solution is not in your history.' });
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/problems/:slug/approaches', (req, res) => {
  try {
    res.json(store.approaches(req.user.id, req.params.slug));
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
