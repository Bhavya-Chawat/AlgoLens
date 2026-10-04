/**
 * Classifies a *source line* (any of Python/JS/Java/C++) into the event types the timeline
 * and canvas already know. Purely cosmetic: it never affects what the program does.
 *
 * Note: a `return` statement stays a plain 'line'. The real 'return' event is emitted by the
 * tracer when the frame actually exits (it carries the return value); marking both would make
 * the call tree pop twice.
 */
const COMMENT = /^(#|\/\/|\/\*|\*)/;
const LOOP = /^(for|while|do)\b/;
const BRANCH = /^(\}\s*)?(if|elif|else|switch|case|default|match|catch|except|finally)\b/;
const THROW = /^(raise|throw)\b/;
const COMPARE = /(==|!=|<=|>=|\bnot in\b|\bin\b|\bis\b)/;
const ASSIGN = /(^|[^=!<>])=([^=]|$)|[+\-*/%&|^]=|<<=|>>=/;

export function classifyLine(text) {
  const t = String(text || '').trim();
  if (!t || COMMENT.test(t)) return 'line';
  if (LOOP.test(t) || /^\}\s*while\b/.test(t)) return 'loop_start';
  if (BRANCH.test(t)) return 'branch';
  if (THROW.test(t)) return 'exception';
  if (/^return\b/.test(t)) return 'line';
  if (COMPARE.test(t)) return 'comparison';
  if (ASSIGN.test(t)) return 'assignment';
  return 'line';
}
