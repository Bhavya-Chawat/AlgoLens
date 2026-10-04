const config = require('../config');
const auth = require('../services/auth');

const COOKIE = 'algolens_session';

function readCookie(header, name) {
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return '';
}

/** HttpOnly (scripts cannot read it), SameSite=Lax (other sites cannot send it with a POST), Secure on HTTPS. */
function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = config.auth.secureCookies ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`);
}

function clearSessionCookie(res) {
  const secure = config.auth.secureCookies ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

/** Sets req.user (or null) and req.sessionToken. A broken database never takes the rest of the API down. */
function session(req, _res, next) {
  req.user = null;
  req.sessionToken = readCookie(req.headers.cookie, COOKIE);
  if (req.sessionToken) {
    try {
      req.user = auth.userForToken(req.sessionToken);
    } catch (error) {
      console.error('Could not read the session:', error.message);
    }
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.', code: 'auth_required' });
  next();
}

/** When ALGOLENS_REQUIRE_LOGIN=1 everything except health and the sign-in routes needs a session. */
function gate(req, res, next) {
  if (!config.auth.requireLogin || req.user) return next();
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
  return res.status(401).json({ error: 'Sign in to use AlgoLens.', code: 'auth_required' });
}

module.exports = { session, requireUser, gate, setSessionCookie, clearSessionCookie, readCookie, COOKIE };
