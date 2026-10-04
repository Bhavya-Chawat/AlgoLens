import { apiJson, apiFetch, ApiError } from '../api/client.js';
import { buildTrace } from '../core/frameBuilder.js';

/**
 * Java and C++ are compiled and traced for real inside a locked-down Docker container, by the
 * local server (see backend/services/exec). This is the browser-side adapter:
 *   inspect(code) -> parsed locally on the server (instant, no AI)
 *   trace(job)    -> runs the code under a debugger and returns the real trace
 *
 * If Docker is not available the run fails with a clear message that says how to fix it. There is
 * no approximate fallback: a trace is either the real run or an error.
 */
const DEFAULT_STEPS = 5000; // a debugger sees ~300 steps/s: keep runs to a few seconds

const HELP = {
  docker_missing: 'Java and C++ run inside Docker (free). Install Docker Desktop, start it, then try again.',
  docker_stopped: 'Docker is installed but not running. Start Docker Desktop, then try again.',
  image_unavailable: 'The language runner could not be downloaded. Check your internet connection and try again.',
  image_missing: 'The language runner is not downloaded yet.',
};

export class RunnerUnavailableError extends Error {
  constructor(code, message) {
    super(HELP[code] || message || 'The sandbox is not available.');
    this.name = 'RunnerUnavailableError';
    this.code = code;
  }
}

async function readLines(response, onLine) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onLine(JSON.parse(line));
    }
    if (done) break;
  }
}

export function createSandboxTracer(language, label) {
  const listeners = new Set();
  const say = (message) => listeners.forEach((fn) => fn(message));

  /** Makes sure Docker is up and the runner image exists (downloading/building it the first time). */
  async function ensureRunner() {
    const status = await apiJson('/runner/status', { method: 'GET' });
    if (status.state !== 'ready') throw new RunnerUnavailableError(status.state === 'missing' ? 'docker_missing' : 'docker_stopped');
    if (status.images?.[language]) return;

    say(`Preparing the ${label} runner (first time only)…`);
    const response = await apiFetch('/runner/prepare', { body: { language } });
    let failure = null;
    await readLines(response, (msg) => {
      if (msg.progress) say(msg.progress);
      if (msg.error) failure = msg;
    });
    if (failure) throw new RunnerUnavailableError(failure.code, failure.error);
  }

  return {
    id: language,
    label,
    kind: 'sandbox',
    needs: 'docker',
    prepare: async () => {},
    isReady: () => true,
    onProgress(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async inspect(code) {
      return apiJson('/inspect', { body: { language, code } });
    },

    async trace(job) {
      try {
        await ensureRunner();
        say(`Running ${label}…`);
        const wire = await apiJson('/run', {
          body: {
            language,
            code: job.code,
            args: job.args,
            mode: job.mode,
            entry: job.entry,
            stdin: job.stdin,
            limits: { ...job.limits, steps: Math.min(job.limits?.steps ?? DEFAULT_STEPS, DEFAULT_STEPS) },
          },
        });
        return buildTrace(wire, job.code);
      } catch (err) {
        // the server answers 503 when Docker is missing or stopped: turn it into the "how to fix it" message
        if (err instanceof ApiError && err.status === 503) throw new RunnerUnavailableError(err.code, err.message);
        throw err;
      }
    },
  };
}
