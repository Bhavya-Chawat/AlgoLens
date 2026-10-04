import { createWorkerClient } from '../workerClient.js';
import { buildTrace } from '../../core/frameBuilder.js';

const RUN_TIMEOUT_MS = 20_000;

const client = createWorkerClient({
  createWorker: () => new Worker(new URL('./javascript.worker.js', import.meta.url), { type: 'module' }),
  initTimeoutMs: 30_000,
});

/**
 * JavaScript is traced for real, in the browser: Babel instruments the code (scope-aware),
 * a worker runs it, and the recorded steps become frames. No network, no AI.
 */
export const javascriptTracer = {
  id: 'javascript',
  label: 'JavaScript',
  kind: 'local',
  needs: null,

  prepare: () => client.ensure(),
  onProgress: (fn) => client.onProgress(fn),
  isReady: () => client.isReady(),

  inspect: (code) => client.call('inspect', { code }, 10_000),

  async trace(job) {
    const wire = await client.call('run', { job }, RUN_TIMEOUT_MS);
    return buildTrace(wire, job.code);
  },
};
