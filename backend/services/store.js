const crypto = require('crypto');
const config = require('../config');
const { getDb, nowSeconds, today, transaction } = require('./db');

/**
 * Everything a signed-in user keeps, and the one aggregate other people may see.
 *
 *  - a *run* is one light row (language, steps, error type, the algorithm the AI named when asked)
 *  - a *solution* is the code of a run; the same code is stored once and just touched again
 *  - the comparison shows only algorithm names and counts, only from people who turned sharing on, and
 *    only once at least two such people exist: nobody's code or single choice is ever shown
 */

const LANGUAGES = new Set(['python', 'javascript', 'java', 'cpp']);
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;

class StoreError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'StoreError';
    this.status = status;
  }
}

const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const clip = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : fallback);

function cleanRun(input) {
  const body = input || {};
  if (!LANGUAGES.has(body.language)) throw new StoreError('Unknown language.');
  if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > config.limits.codeChars) throw new StoreError('Provide the code of this run.');
  const problemKey = typeof body.problemKey === 'string' && SLUG.test(body.problemKey) ? body.problemKey : null;
  return {
    language: body.language,
    code: body.code,
    problemKey,
    title: clip(body.title, 120),
    steps: int(body.steps),
    truncated: body.truncated === true ? 1 : 0,
    errorType: clip(body.errorType, 60),
  };
}

/** Saves a run and its code (once per distinct code). Returns the ids. */
function saveRun(userId, input) {
  const run = cleanRun(input);
  const now = nowSeconds();
  return transaction((db) => {
    const solution = db
      .prepare(`INSERT INTO solutions (user_id, problem_key, title, language, code, code_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, code_hash) DO UPDATE SET
                  updated_at = excluded.updated_at,
                  problem_key = COALESCE(excluded.problem_key, solutions.problem_key),
                  title = COALESCE(excluded.title, solutions.title)
                RETURNING id`)
      .get(userId, run.problemKey, run.title, run.language, run.code, hashCode(run.code), now, now);
    const result = db
      .prepare(`INSERT INTO runs (user_id, solution_id, problem_key, language, steps, truncated, error_type, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, solution.id, run.problemKey, run.language, run.steps, run.truncated, run.errorType, now);
    db.prepare(`DELETE FROM runs WHERE user_id = ? AND id NOT IN (SELECT id FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT ?)`)
      .run(userId, userId, config.db.maxRunsPerUser);
    db.prepare(`DELETE FROM solutions WHERE user_id = ? AND id NOT IN (SELECT id FROM solutions WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?)`)
      .run(userId, userId, config.db.maxSolutionsPerUser);
    return { runId: Number(result.lastInsertRowid), solutionId: Number(solution.id) };
  });
}

function listSolutions(userId, limit = 50) {
  return getDb()
    .prepare(`SELECT s.id, s.problem_key AS problemKey, s.title, s.language, s.updated_at AS updatedAt,
                     substr(s.code, 1, 160) AS preview,
                     (SELECT COUNT(*) FROM runs r WHERE r.solution_id = s.id) AS runs,
                     (SELECT r.algorithm FROM runs r WHERE r.solution_id = s.id AND r.algorithm IS NOT NULL ORDER BY r.id DESC LIMIT 1) AS algorithm
              FROM solutions s WHERE s.user_id = ? ORDER BY s.updated_at DESC, s.id DESC LIMIT ?`)
    .all(userId, Math.min(Math.max(int(limit, 50), 1), 200));
}

function getSolution(userId, id) {
  return getDb()
    .prepare('SELECT id, problem_key AS problemKey, title, language, code, updated_at AS updatedAt FROM solutions WHERE id = ? AND user_id = ?')
    .get(int(id, -1), userId) || null;
}

function deleteSolution(userId, id) {
  return getDb().prepare('DELETE FROM solutions WHERE id = ? AND user_id = ?').run(int(id, -1), userId).changes > 0;
}

function listRuns(userId, limit = 30) {
  return getDb()
    .prepare(`SELECT id, solution_id AS solutionId, problem_key AS problemKey, language, steps, truncated, error_type AS errorType,
                     algorithm, created_at AS createdAt
              FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, Math.min(Math.max(int(limit, 30), 1), 200));
}

/** Remembers which algorithm the AI named for a run (only the person's own run can be labelled). */
function setRunAlgorithm(userId, runId, algorithm) {
  const label = clip(algorithm, 40);
  if (!label) return false;
  return getDb().prepare('UPDATE runs SET algorithm = ? WHERE id = ? AND user_id = ?').run(label, int(runId, -1), userId).changes > 0;
}

/**
 * Who solved this problem how. `mine` is always shown; `others` only when two or more people agreed to share.
 */
function approaches(userId, problemKey) {
  if (typeof problemKey !== 'string' || !SLUG.test(problemKey)) throw new StoreError('Unknown problem.');
  const db = getDb();
  const mine = db
    .prepare(`SELECT algorithm, COUNT(*) AS count FROM runs WHERE user_id = ? AND problem_key = ? AND algorithm IS NOT NULL
              GROUP BY algorithm ORDER BY count DESC LIMIT 8`)
    .all(userId, problemKey);
  const people = db
    .prepare(`SELECT COUNT(DISTINCT r.user_id) AS people FROM runs r JOIN users u ON u.id = r.user_id
              WHERE r.problem_key = ? AND r.algorithm IS NOT NULL AND u.share_stats = 1`)
    .get(problemKey).people;
  const others = people >= 2
    ? db
      .prepare(`SELECT r.algorithm AS algorithm, COUNT(DISTINCT r.user_id) AS count FROM runs r JOIN users u ON u.id = r.user_id
                WHERE r.problem_key = ? AND r.algorithm IS NOT NULL AND u.share_stats = 1
                GROUP BY r.algorithm ORDER BY count DESC LIMIT 8`)
      .all(problemKey)
    : [];
  return { problemKey, people, mine, others };
}

// ── AI answers: cached per user and run, and capped per day ─────────────────────────────────────────
function getCachedStory(userId, key) {
  const row = getDb().prepare('SELECT story FROM ai_cache WHERE user_id = ? AND cache_key = ?').get(userId, key);
  if (!row) return null;
  try {
    return JSON.parse(row.story);
  } catch {
    return null;
  }
}

function putCachedStory(userId, key, story) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO ai_cache (user_id, cache_key, story, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, key, JSON.stringify(story), nowSeconds());
  db.prepare('DELETE FROM ai_cache WHERE user_id = ? AND cache_key NOT IN (SELECT cache_key FROM ai_cache WHERE user_id = ? ORDER BY created_at DESC LIMIT 200)')
    .run(userId, userId);
}

function aiCallsToday(userId) {
  const row = getDb().prepare('SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?').get(userId, today());
  return row ? row.calls : 0;
}

function countAiCall(userId, tokens = 0) {
  getDb()
    .prepare(`INSERT INTO ai_usage (user_id, day, calls, tokens) VALUES (?, ?, 1, ?)
              ON CONFLICT (user_id, day) DO UPDATE SET calls = calls + 1, tokens = tokens + excluded.tokens`)
    .run(userId, today(), int(tokens));
}

module.exports = {
  StoreError, saveRun, listSolutions, getSolution, deleteSolution, listRuns, setRunAlgorithm, approaches,
  getCachedStory, putCachedStory, aiCallsToday, countAiCall, hashCode,
};
