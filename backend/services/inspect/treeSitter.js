const { Parser, Language } = require('web-tree-sitter');

/**
 * tree-sitter (WebAssembly, no native build) is used ONLY to read function signatures from
 * Java / C++ source so the UI can offer "Run as" and fill the Function Arguments panel.
 * It never generates or changes code.
 */
let ready = null;
const languages = new Map();

async function parserFor(language) {
  ready ||= Parser.init();
  await ready;
  if (!languages.has(language)) {
    languages.set(language, await Language.load(require.resolve(`tree-sitter-wasms/out/tree-sitter-${language}.wasm`)));
  }
  const parser = new Parser();
  parser.setLanguage(languages.get(language));
  return parser;
}

/** Runs `fn(rootNode)` on a parsed tree and frees the WASM memory afterwards. */
async function withTree(language, code, fn) {
  const parser = await parserFor(language);
  const tree = parser.parse(code);
  try {
    return fn(tree.rootNode);
  } finally {
    tree.delete();
    parser.delete();
  }
}

/** Marks entries that are called from other functions (helpers) and sorts the likely entry first. */
function rank(entries, calledByOthers) {
  for (const e of entries) e.isHelper = calledByOthers.has(e.name);
  return entries.sort((a, b) => Number(a.isHelper) - Number(b.isHelper) || Number(a.className !== 'Solution') - Number(b.className !== 'Solution'));
}

module.exports = { withTree, rank };
