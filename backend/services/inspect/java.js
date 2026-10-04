const { withTree, rank } = require('./treeSitter');

/**
 * Java: entries = methods of top-level classes. `public static void main(String[])` is not an
 * entry: its presence just means the file is a program (script mode).
 */
function inspectJava(code) {
  return withTree('java', code, (root) => {
    const entries = [];
    const called = new Set();
    let hasMain = false;

    for (const cls of root.namedChildren.filter((n) => n.type === 'class_declaration')) {
      const className = cls.childForFieldName('name')?.text;
      const body = cls.childForFieldName('body');
      if (!className || !body) continue;

      for (const method of body.namedChildren.filter((n) => n.type === 'method_declaration')) {
        const name = method.childForFieldName('name')?.text;
        if (!name) continue;
        const params = (method.childForFieldName('parameters')?.namedChildren || [])
          .filter((p) => p.type === 'formal_parameter' || p.type === 'spread_parameter')
          .map((p) => ({
            name: p.childForFieldName('name')?.text ?? `arg${p.id}`,
            type: p.childForFieldName('type')?.text ?? null,
            hasDefault: false,
          }));
        const modifiers = method.namedChildren.find((n) => n.type === 'modifiers')?.text || '';
        if (name === 'main' && /\bstatic\b/.test(modifiers)) { hasMain = true; continue; }

        entries.push({
          name, className, params,
          returnType: method.childForFieldName('type')?.text ?? null,
          line: method.startPosition.row + 1,
          isStatic: /\bstatic\b/.test(modifiers),
          isPrivate: /\bprivate\b/.test(modifiers),
        });

        for (const call of method.descendantsOfType('method_invocation')) {
          const callee = call.childForFieldName('name')?.text;
          if (callee && callee !== name) called.add(callee);
        }
      }
    }
    return { entries: rank(entries, called), scriptLike: hasMain };
  });
}

module.exports = { inspectJava };
