const crypto = require('crypto');
const { promisify } = require('util');
const config = require('../config');
const { getDb, nowSeconds } = require('./db');

const scrypt = promisify(crypto.scrypt);

/**
 * Accounts, with nothing but Node's own crypto:
 *  - passwords: scrypt with a random salt per user, stored as `scrypt$N$r$p$salt$hash` so the cost can be raised
 *    later without breaking old hashes
 *  - sessions: a random 256-bit token in an HttpOnly cookie; the database keeps only its SHA-256
 *  - the same message for "no such user" and "wrong password", and a dummy hash check for unknown users so the
 *    two cases take about the same time
 */

const COST = { N: 16384, r: 8, p: 1, keylen: 64 };
const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

class AuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

const b64 = (buffer) => buffer.toString('base64');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, COST.keylen, { N: COST.N, r: COST.r, p: COST.p });
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummy = null;
async function burnTime(password) {
  if (!dummy) dummy = await hashPassword(crypto.randomBytes(8).toString('hex'));
  await verifyPassword(password, dummy);
}

/** Returns a message a person can act on, or null when the credentials are acceptable. */
function validateCredentials({ username, password }) {
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    return 'Pick a username of 3 to 30 letters, numbers, dots, dashes or underscores.';
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Use a password of at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use a password of at most ${PASSWORD_MAX} characters.`;
  return null;
}

function publicUser(row) {
  return row ? { id: row.id, username: row.username, shareStats: Boolean(row.share_stats), createdAt: row.created_at } : null;
}

async function createUser({ username, password, shareStats = false }) {
  const problem = validateCredentials({ username, password });
  if (problem) throw new AuthError('invalid', problem);
  const db = getDb();
  const hash = await hashPassword(password);
  try {
    const result = db
      .prepare('INSERT INTO users (username, password_hash, share_stats, created_at) VALUES (?, ?, ?, ?)')
      .run(username, hash, shareStats ? 1 : 0, nowSeconds());
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid)));
  } catch (error) {
    if (/UNIQUE/i.test(String(error.message))) throw new AuthError('username_taken', 'That username is taken. Try another.', 409);
    throw error;
  }
}

/** The user for these credentials, or null. */
async function checkLogin(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > PASSWORD_MAX) return null;
  const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) {
    await burnTime(password);
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? publicUser(row) : null;
}

// ── sessions ────────────────────────────────────────────────────────────────────────────────────
const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('base64url');
  const now = nowSeconds();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash(token), userId, now, now + config.auth.sessionDays * 86400);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now); // housekeeping, once per login
  return { token, maxAgeSeconds: config.auth.sessionDays * 86400 };
}

function userForToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const row = getDb()
    .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .get(tokenHash(token), nowSeconds());
  return publicUser(row);
}

function destroySession(token) {
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function destroyAllSessions(userId) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ── account settings ────────────────────────────────────────────────────────────────────────────
function setShareStats(userId, share) {
  getDb().prepare('UPDATE users SET share_stats = ? WHERE id = ?').run(share ? 1 : 0, userId);
  return publicUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

/** Removes the account and, through ON DELETE CASCADE, everything stored for it. */
function deleteUser(userId) {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
}

async function passwordMatchesUser(userId, password) {
  const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return Boolean(row) && typeof password === 'string' && password.length <= PASSWORD_MAX && (await verifyPassword(password, row.password_hash));
}

module.exports = {
  AuthError, hashPassword, verifyPassword, validateCredentials, createUser, checkLogin, publicUser,
  createSession, userForToken, destroySession, destroyAllSessions, setShareStats, deleteUser, passwordMatchesUser,
  tokenHash,
};
