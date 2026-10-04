const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * One SQLite file with Node's built-in `node:sqlite` (Node 22.13+): no native module to build, nothing to install,
 * free to run anywhere. The schema is versioned with PRAGMA user_version, so a later release can add a step to
 * MIGRATIONS and existing databases are upgraded on start.
 *
 * What is stored (and why):
 *   users      username + salted scrypt hash, and whether the person agreed to share anonymous approach stats
 *   sessions   only the SHA-256 of the session token, never the token itself
 *   solutions  the code a signed-in user ran (one row per distinct code) so they can come back to it
 *   runs       one light row per run: language, steps, error type, and the algorithm the AI named (if asked)
 *   ai_cache   an AI "Explain" answer per user and run, so the same run never costs a second call
 *   ai_usage   calls per user and day, for the daily cap
 */
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    share_stats   INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE solutions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_key TEXT,
    title       TEXT,
    language    TEXT    NOT NULL,
    code        TEXT    NOT NULL,
    code_hash   TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    UNIQUE (user_id, code_hash)
  );
  CREATE INDEX solutions_user ON solutions(user_id, updated_at DESC);
  CREATE TABLE runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    solution_id INTEGER REFERENCES solutions(id) ON DELETE SET NULL,
    problem_key TEXT,
    language    TEXT    NOT NULL,
    steps       INTEGER NOT NULL,
    truncated   INTEGER NOT NULL DEFAULT 0,
    error_type  TEXT,
    algorithm   TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX runs_user ON runs(user_id, created_at DESC);
  CREATE INDEX runs_problem ON runs(problem_key);
  CREATE TABLE ai_cache (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cache_key  TEXT    NOT NULL,
    story      TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, cache_key)
  );
  CREATE TABLE ai_usage (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT    NOT NULL,
    calls   INTEGER NOT NULL DEFAULT 0,
    tokens  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  `,
];

let handle = null;

function loadSqlite() {
  try {
    return require('node:sqlite');
  } catch {
    throw new Error('Accounts need Node.js 22.13 or newer (built-in SQLite). Update Node, or run without accounts.');
  }
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** Opens a database (and upgrades it). Tests pass ':memory:'. */
function openDb(file = config.db.file) {
  const { DatabaseSync } = loadSqlite();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

/** The shared connection, opened on first use. */
function getDb() {
  if (!handle) handle = openDb();
  return handle;
}

function closeDb() {
  if (handle) handle.close();
  handle = null;
}

/** Runs `fn(db)` in a transaction: all of it or none of it. */
function transaction(fn) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);

module.exports = { getDb, openDb, closeDb, transaction, nowSeconds, today, MIGRATIONS };
