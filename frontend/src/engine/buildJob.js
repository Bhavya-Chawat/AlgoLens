import { PLACEHOLDER_CODE } from '../constants/placeholders.js';

export const DEFAULT_LIMITS = { steps: 20_000, stdout: 65_536 };

const LITERAL_WORDS = { True: 'true', False: 'false', None: 'null', undefined: 'null', nil: 'null' };

/**
 * Turns Python/JS-style literals into JSON: single quotes, True/False/None/undefined and
 * trailing commas. Walks the text character by character so anything *inside* a string
 * is never touched ("True story" stays "True story").
 */
function looseToJson(text) {
  let out = '';
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let body = '';
      i += 1;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === '\\' && i + 1 < text.length) {
          body += text[i] + text[i + 1];
          i += 2;
        } else {
          body += text[i];
          i += 1;
        }
      }
      i += 1; // closing quote
      // re-quote with double quotes; an escaped single quote needs no escape any more
      out += `"${ch === "'" ? body.replace(/\\'/g, "'").replace(/"/g, '\\"') : body}"`;
    } else if (/[A-Za-z_]/.test(ch)) {
      let word = '';
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) word += text[i++];
      out += LITERAL_WORDS[word] ?? word;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.replace(/,\s*([\]}])/g, '$1');
}

/** "[1, 2]" | "['a', None]" | "hello" -> the value. Anything that is not a literal stays a string. */
export function parseLooseValue(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(looseToJson(raw));
    } catch {
      return raw;
    }
  }
}

/** Function Arguments rows [{key,val}] -> { key: value }. */
export function argsFromInputs(customInputs = []) {
  const args = {};
  for (const { key, val } of customInputs) {
    if (key && key.trim()) args[key.trim()] = parseLooseValue(val);
  }
  return args;
}

/** "Class.method" | "method" -> { className, name } */
export function parseEntryChoice(choice) {
  const [a, b] = String(choice).split('.');
  return b ? { className: a, name: b } : { className: null, name: a };
}

export function entryLabel(entry) {
  return entry.className ? `${entry.className}.${entry.name}` : entry.name;
}

/**
 * Decides *what* to run:
 *   - arguments supplied + a function exists  -> call that function with them (LeetCode style)
 *   - no arguments and the module does work   -> run the script top to bottom
 *   - the user can always override via "Run as"
 */
export function chooseRun({ info, args, entryChoice }) {
  const entries = info?.entries || [];
  if (entryChoice === 'script') return { mode: 'script', entry: null };
  if (entryChoice && entryChoice !== 'auto') return { mode: 'function', entry: parseEntryChoice(entryChoice) };
  const hasArgs = Object.keys(args).length > 0;
  if (!hasArgs && info?.scriptLike) return { mode: 'script', entry: null };
  if (entries.length) return { mode: 'function', entry: { className: entries[0].className, name: entries[0].name } };
  return { mode: 'script', entry: null };
}

export async function buildJob(state, tracer) {
  const code = state.code || (state.editorMode === 'leetcode' ? PLACEHOLDER_CODE[state.language] : '');
  const args = argsFromInputs(state.customInputs);

  let info = null;
  try {
    info = await tracer.inspect(code);
  } catch {
    /* the tracer itself will report a syntax error with a proper line number */
  }
  const { mode, entry } = chooseRun({ info, args, entryChoice: state.entryChoice });

  const paramTypes = {};
  for (const p of state.leetcodeProblem?.signature?.params || []) paramTypes[p.name] = p.type;

  return {
    language: state.language,
    code,
    args,
    mode,
    entry,
    paramTypes,
    stdin: state.stdin || '',
    limits: DEFAULT_LIMITS,
  };
}
