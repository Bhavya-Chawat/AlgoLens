const crypto = require('crypto');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function deny(res, status, message) {
  return res.status(status).json({ error: message });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * The API runs on the user's own machine and can spend their AI quota (and, for the
 * Java/C++ runner, execute code), so a random website must never be able to call it.
 *
 *  - Host allow-list      -> blocks DNS rebinding
 *  - Origin allow-list    -> blocks cross-site fetches from other pages
 *  - JSON-only bodies     -> forces a CORS preflight for anything cross-site
 *  - optional launch token -> blocks other local programs/pages (packaged app)
 */
function createSecurity({ allowedHosts, allowedOrigins, token }) {
  const origins = new Set(allowedOrigins);

  const hostGuard = (req, res, next) => {
    const host = String(req.headers.host || '').toLowerCase();
    if (!allowedHosts.has(host)) return deny(res, 403, 'Forbidden host.');
    next();
  };

  const originGuard = (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return deny(res, 403, 'Forbidden origin.');
    next();
  };

  const tokenGuard = (req, res, next) => {
    if (!token) return next();
    const sent = req.headers['x-algolens-token'];
    if (!sent || !safeEqual(sent, token)) return deny(res, 401, 'Missing or invalid session token.');
    next();
  };

  const jsonGuard = (req, res, next) => {
    if (BODY_METHODS.has(req.method) && !req.is('application/json')) {
      return deny(res, 415, 'Content-Type must be application/json.');
    }
    next();
  };

  const headers = (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  return [headers, hostGuard, originGuard, tokenGuard, jsonGuard];
}

module.exports = { createSecurity };
