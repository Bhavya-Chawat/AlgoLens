import { createWorkerClient } from '../workerClient.js';
import { buildTrace } from '../../core/frameBuilder.js';

const RUN_TIMEOUT_MS = 20_000;

const client = createWorkerClient({
  createWorker: () => new Worker(new URL('./python.worker.js', import.meta.url), { type: 'module' }),
  initPayload: () => ({ base: new URL(import.meta.env.BASE_URL, window.location.href).href }),
});

/** Python is traced for real, in the browser, by running the code under sys.settrace in Pyodide. */
export const pythonTracer = {
  id: 'python',
  label: 'Python',
  kind: 'local',
  needs: null,

  prepare: () => client.ensure(),
  onProgress: (fn) => client.onProgress(fn),
  isReady: () => client.isReady(),

  /** Entry-point candidates: [{ name, className, params:[{name,type,hasDefault}], isHelper }] */
  async inspect(code) {
    return JSON.parse(await client.call('inspect', { code }, 10_000));
  },

  async trace(job) {
    const raw = await client.call('run', { job }, RUN_TIMEOUT_MS);
    return buildTrace(JSON.parse(raw), job.code);
  },
};
