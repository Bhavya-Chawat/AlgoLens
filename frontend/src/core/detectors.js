/**
 * Local (free, instant) problem detection on a finished trace.
 * Returns the `bugs` list the Bugs panel / timeline already render:
 *   { frameId, type, description, severity: 'error' | 'warning' }
 */

const ERROR_KINDS = [
  [/IndexError|IndexOutOfBounds|out_of_range|ArrayIndexOutOfBounds|StringIndexOutOfBounds/i, 'index_out_of_bounds'],
  [/KeyError|NoSuchElement/i, 'missing_key'],
  [/NameError|UnboundLocal|ReferenceError/i, 'uninitialized'],
  [/RecursionError|StackOverflow|Maximum call stack/i, 'infinite_loop'],
  [/ZeroDivision|ArithmeticException|division by zero/i, 'division_by_zero'],
  [/NullPointer|AttributeError.*None|Cannot read propert/i, 'null_reference'],
  [/TypeError/i, 'type_error'],
];

export function errorKind(typeName, message = '') {
  const text = `${typeName} ${message}`;
  for (const [pattern, kind] of ERROR_KINDS) if (pattern.test(text)) return kind;
  return 'runtime_error';
}

const DEEP_RECURSION = 50;

export function detectBugs(frames, { error, truncated, limit }) {
  const bugs = [];

  const bugFrame = frames.findIndex((f) => f.isBugFrame);
  if (error && bugFrame !== -1) {
    bugs.push({
      frameId: bugFrame,
      type: errorKind(error.type, error.message),
      description: `${error.type}: ${error.message}`,
      severity: 'error',
    });
  }

  if (truncated && frames.length) {
    bugs.push({
      frameId: frames.length - 1,
      type: 'infinite_loop',
      description: `Stopped after ${limit?.toLocaleString?.() ?? limit} steps - likely an infinite loop or a very long run.`,
      severity: 'error',
    });
  }

  if (!bugs.some((b) => b.type === 'infinite_loop')) {
    const deep = frames.findIndex((f) => (f.callStack?.length || 0) >= DEEP_RECURSION);
    if (deep !== -1) {
      bugs.push({
        frameId: deep,
        type: 'infinite_loop',
        description: `Call stack reached ${DEEP_RECURSION}+ frames - check the base case.`,
        severity: 'warning',
      });
    }
  }
  return bugs;
}
