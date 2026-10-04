import { ARRAY_EXAMPLES } from './arrays.js';
import { STRUCTURE_EXAMPLES } from './structures.js';
import { GRAPH_EXAMPLES } from './graphs.js';
import { DP_EXAMPLES } from './dp.js';
import { HARD_EXAMPLES } from './hard.js';
import { JAVASCRIPT_VARIANTS } from './variants/javascript.js';
import { CPP_VARIANTS } from './variants/cpp.js';
import { JAVA_VARIANTS } from './variants/java.js';

/**
 * The example library: each entry has one program per language it is available in
 *   { id, title, category, blurb, expects: [lens ids], python?: {code, args?}, javascript?, java?, cpp? }
 * `args` (when present) are the Function Arguments; without them the program runs as a script.
 */
const BASE = [...ARRAY_EXAMPLES, ...STRUCTURE_EXAMPLES, ...GRAPH_EXAMPLES, ...DP_EXAMPLES, ...HARD_EXAMPLES];

/** Per-language variants live in variants/*.js and are attached to the example with the same id. */
const VARIANTS = { javascript: JAVASCRIPT_VARIANTS, cpp: CPP_VARIANTS, java: JAVA_VARIANTS };
export const EXAMPLES = BASE.map((e) => {
  const extra = {};
  for (const [language, table] of Object.entries(VARIANTS)) if (!e[language] && table[e.id]) extra[language] = table[e.id];
  return Object.keys(extra).length ? { ...e, ...extra } : e;
});

export const CATEGORIES = [...new Set(EXAMPLES.map((e) => e.category))];

export const LANGUAGES = ['python', 'javascript', 'java', 'cpp'];

export function examplesFor(language) {
  return EXAMPLES.filter((e) => e[language]);
}

/** Function Arguments rows for the editor: [{key, val}] with val as JSON text. */
export function inputsFor(example, language) {
  const args = example[language]?.args || {};
  return Object.entries(args).map(([key, value]) => ({ key, val: JSON.stringify(value) }));
}

export function exampleById(id) {
  return EXAMPLES.find((e) => e.id === id) || null;
}
