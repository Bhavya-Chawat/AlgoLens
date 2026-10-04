const config = require('../../config');
const docker = require('./runners/docker');
const local = require('./runners/local');
const { createCollector } = require('./collector');
const { inspect } = require('../inspect');
const { buildCppDriver, breakSpec } = require('./cppDriver');

/** A problem with the request itself (the caller can fix it): shown to the user as is. */
class JobError extends Error {}

const LANGUAGES = new Set(['java', 'cpp']);
const MODES = new Set(['function', 'script']);
const MAX_STEPS = 20_000;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

/** Validates the request body into a job the runner accepts. Throws a plain Error with a user-facing message. */
function normalizeJob(body) {
  const { language, code, args, mode, entry, stdin, limits } = body || {};
  if (!LANGUAGES.has(language)) throw new JobError(`${language} is not traced by the sandbox runner.`);
  if (typeof code !== 'string' || !code.trim() || code.length > config.limits.codeChars) {
    throw new JobError('Provide the code to run (max 200,000 characters).');
  }
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) throw new JobError('args must be an object.');
  const job = {
    code,
    args: args || {},
    mode: MODES.has(mode) ? mode : 'function',
    entry: entry && typeof entry === 'object' ? { className: entry.className ?? null, name: entry.name ?? null } : null,
    stdin: typeof stdin === 'string' ? stdin.slice(0, 65_536) : '',
    limits: {
      steps: clamp(limits?.steps, 100, MAX_STEPS, 5000),
      stdout: clamp(limits?.stdout, 1024, 262_144, 65_536),
      timeMs: clamp(limits?.timeMs, 3000, 60_000, 30_000),
      // how long the program may produce no new line before it counts as stuck (single-line infinite loops)
      idleMs: clamp(limits?.idleMs, 1500, 30_000, 6000),
    },
  };
  return { language, job };
}

/** C++ needs the typed driver: the entry's signature is read by the server, not trusted from the client. */
async function prepareCpp(job) {
  const info = await inspect('cpp', job.code);
  if (job.mode === 'script') {
    job.breakSpec = 'main';
    job.driver = '';
    return;
  }
  const wanted = job.entry?.name
    ? info.entries.find((e) => e.name === job.entry.name && (!job.entry.className || e.className === job.entry.className))
    : info.entries[0];
  if (!wanted) throw new JobError('No function to run was found. Write a function (or a Solution class), or run it as a script with main().');
  job.entry = { className: wanted.className, name: wanted.name, params: wanted.params, returnType: wanted.returnType };
  job.driver = buildCppDriver(wanted);
  job.breakSpec = breakSpec(wanted);
}

function pickRunner(language) {
  if (config.runner.mode === 'local' && local.available(language)) return { name: 'local', runner: local };
  return { name: 'docker', runner: docker };
}

/**
 * Really runs the code (Java/C++) under a debugger and returns the AlgoTrace wire object.
 * Throws RunnerUnavailable when Docker is missing / stopped / lacks the image.
 */
async function runTrace(body, { onProgress } = {}) {
  const { language, job } = normalizeJob(body);
  if (language === 'cpp') await prepareCpp(job);
  const collector = createCollector({ language, limit: job.limits.steps, mode: job.mode, entry: job.entry, onProgress });
  const { runner } = pickRunner(language);

  const result = await runner.run(language, JSON.stringify(job), { timeoutMs: job.limits.timeMs, onLine: collector.push });
  const failure = result.code !== 0 ? (result.stderr.trim().split('\n').pop() || `The runner exited with code ${result.code}.`) : null;
  return collector.finish(failure);
}

async function runnerStatus() {
  const st = await docker.status({ fresh: true });
  const images = {};
  for (const language of LANGUAGES) images[language] = st.state === 'ready' ? await docker.hasImage(st.engine, language) : false;
  return { ...st, images, localDevRunner: config.runner.mode === 'local' };
}

module.exports = { runTrace, runnerStatus, normalizeJob, JobError, ensureImage: docker.ensureImage, RunnerUnavailable: docker.RunnerUnavailable, LANGUAGES };
