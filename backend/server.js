const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { createSecurity } = require('./middleware/security');
const { session, gate } = require('./middleware/session');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.ALGOLENS_TRUST_PROXY === '1') app.set('trust proxy', 1); // hosted behind a proxy: real client IPs

  app.use('/api', createSecurity(config));
  app.use(express.json({ limit: config.limits.jsonBody }));

  // Generous: this is one person on their own machine. AI routes are tighter (free-tier quotas).
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: 'draft-7', legacyHeaders: false }));
  const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
  // Password guessing: a few tries per quarter hour per address, on the two routes that take a password.
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Wait a few minutes.', code: 'rate_limited' } });

  app.use('/api', session); // who is this? (req.user, or null)
  app.use('/api', gate); // ALGOLENS_REQUIRE_LOGIN=1: nothing but sign-in works without one

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth/register', loginLimiter);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/me', require('./routes/data')); // saved runs and solutions (signed-in users only)
  app.use('/api/ai', aiLimiter, require('./routes/ai'));
  app.use('/api/hint', aiLimiter, require('./routes/hint'));
  app.use('/api/leetcode', require('./routes/leetcode'));
  app.use('/api', require('./routes/run')); // /inspect, /run, /runner/status, /runner/prepare

  // Malformed JSON and other unexpected errors never leak internals.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    if (err.status === 413) return res.status(413).json({ error: 'Request body is too large.' });
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(config.port, config.host, () => {
    console.log(`AlgoLens API listening on http://${config.host}:${config.port} (loopback only)`);
  });
}

module.exports = { createApp };
