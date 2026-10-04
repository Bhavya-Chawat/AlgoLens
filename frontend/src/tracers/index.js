import { pythonTracer } from './python/pythonTracer.js';
import { javascriptTracer } from './javascript/javascriptTracer.js';
import { createSandboxTracer } from './sandboxTracer.js';

/**
 * Every language implements the same small contract:
 *   id, label, kind ('local' | 'sandbox')
 *   prepare()         -> loads the runtime (idempotent)
 *   inspect(code)     -> { entries:[{name,className,params,isHelper}], scriptLike }
 *   trace(job)        -> { frames, bugs, stdout, result, error, truncated, meta }
 * so the UI never needs to know *how* a language is traced.
 */
const tracers = {
  python: pythonTracer,
  javascript: javascriptTracer,
  java: createSandboxTracer('java', 'Java'),
  cpp: createSandboxTracer('cpp', 'C++'),
};

export const getTracer = (language) => tracers[language] || null;
export const setTracer = (language, tracer) => {
  tracers[language] = tracer;
};
