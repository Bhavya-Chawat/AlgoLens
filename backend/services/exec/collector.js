/**
 * Turns the runner's JSON-lines protocol into an "AlgoTrace v1" wire object.
 * (Format: see frontend/src/core/frameBuilder.js - Python, JavaScript, Java and C++ all produce it.)
 *
 *   {"t":"p","m":"..."}                progress message
 *   {"t":"s","k":"call|line|ret|exc"}  one step
 *   {"t":"e", ...}                     the end (stdout, result, error, truncated, timedOut)
 */
function createCollector({ language, limit, mode, entry, onProgress }) {
  const wire = {
    v: 1, language, steps: [], truncated: false, limit, mode, entry,
    output: { stdout: '', result: null, resultPlain: null, error: null },
  };
  let ended = false;

  function push(line) {
    if (!line) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return; // not protocol output (e.g. a JVM banner): ignore
    }
    if (message.t === 'p') {
      if (onProgress) onProgress(message.m);
    } else if (message.t === 's') {
      const { t, ...step } = message; // eslint-disable-line no-unused-vars
      wire.steps.push(step);
    } else if (message.t === 'e') {
      ended = true;
      wire.truncated = Boolean(message.truncated);
      wire.output.stdout = message.stdout || '';
      wire.output.stdoutClipped = Boolean(message.stdoutClipped);
      if (message.result) {
        wire.output.result = [message.result.type, message.result.value];
        wire.output.resultPlain = message.result.plain ?? null;
      }
      wire.output.error = message.error || null;
      if (message.timing) wire.timing = message.timing;
      if (message.timedOut) {
        wire.output.error = {
          type: 'Timeout',
          message: 'The program ran too long and was stopped (possible infinite loop).',
          line: wire.steps.length ? wire.steps[wire.steps.length - 1].l : null,
        };
      }
    }
  }

  return {
    push,
    /** Call when the process ended; `failure` explains why there was no proper end message. */
    finish(failure) {
      if (!ended && failure) {
        wire.output.error = { type: 'RunnerError', message: failure, line: null };
      }
      return wire;
    },
  };
}

module.exports = { createCollector };
