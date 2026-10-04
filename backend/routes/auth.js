const express = require('express');
const config = require('../config');
const auth = require('../services/auth');
const { requireUser, setSessionCookie, clearSessionCookie } = require('../middleware/session');

const router = express.Router();

function fail(res, error) {
  if (error instanceof auth.AuthError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(error);
  return res.status(500).json({ error: 'Accounts are not available right now.', code: 'accounts_unavailable' });
}

function startSession(res, user) {
  const { token, maxAgeSeconds } = auth.createSession(user.id);
  setSessionCookie(res, token, maxAgeSeconds);
}

/** What the UI needs before it knows who is signed in. */
router.get('/config', (_req, res) => {
  res.json({ requireLogin: config.auth.requireLogin, allowRegistration: config.auth.allowRegistration });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.post('/register', async (req, res) => {
  if (!config.auth.allowRegistration) return res.status(403).json({ error: 'New accounts are turned off on this server.', code: 'registration_closed' });
  try {
    const { username, password, shareStats } = req.body || {};
    const user = await auth.createUser({ username, password, shareStats: shareStats === true });
    startSession(res, user);
    res.status(201).json({ user });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await auth.checkLogin(username, password);
    if (!user) return res.status(401).json({ error: 'Wrong username or password.', code: 'bad_credentials' });
    startSession(res, user);
    res.json({ user });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/logout', (req, res) => {
  try {
    auth.destroySession(req.sessionToken);
  } catch (error) {
    console.error(error);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Only one setting exists: whether anonymous approach stats are shared (off until the person turns it on). */
router.patch('/me', requireUser, (req, res) => {
  try {
    const { shareStats } = req.body || {};
    if (typeof shareStats !== 'boolean') return res.status(400).json({ error: 'shareStats must be true or false.' });
    res.json({ user: auth.setShareStats(req.user.id, shareStats) });
  } catch (error) {
    fail(res, error);
  }
});

/** Deletes the account and everything stored for it. Needs the password again. */
router.delete('/me', requireUser, async (req, res) => {
  try {
    if (!(await auth.passwordMatchesUser(req.user.id, req.body?.password))) {
      return res.status(401).json({ error: 'That password is not right.', code: 'bad_credentials' });
    }
    auth.deleteUser(req.user.id);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
