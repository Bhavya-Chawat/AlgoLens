const { withTree, rank } = require('./treeSitter');

/** First identifier inside a (possibly pointer/reference/array) declarator: the parameter's name. */
function declaredName(node) {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'field_identifier') return node;
  for (const child of node.namedChildren) {
    const found = declaredName(child);
    if (found) return found;
  }
  return null;
}

function functionName(declarator) {
  const inner = declarator?.childForFieldName('declarator');
  if (!inner) return null;
  // `Solution::twoSum` (out-of-class definition) -> twoSum
  return inner.type === 'qualified_identifier' ? inner.childForFieldName('name')?.text : inner.text;
}

/**
 * `ListNode* reverse(ListNode* h)` parses as pointer_declarator(function_declarator): the `*` belongs to the
 * declarator, not the type. Unwrap to the function_declarator and give back the stars/ampersands, so the
 * return type reads "ListNode*" (the runner needs it to render list and tree results).
 */
function unwrapDeclarator(node) {
  let current = node;
  let suffix = '';
  while (current && (current.type === 'pointer_declarator' || current.type === 'reference_declarator')) {
    suffix += current.type === 'pointer_declarator' ? '*' : '&';
    current = current.childForFieldName('declarator') ?? current.namedChildren.find((c) => c.type.endsWith('declarator'));
  }
  return { declarator: current, suffix };
}

function describe(fn, code, className) {
  const { declarator, suffix } = unwrapDeclarator(fn.childForFieldName('declarator'));
  const name = functionName(declarator);
  if (!name || declarator?.type !== 'function_declarator') return null;
  const params = (declarator.childForFieldName('parameters')?.namedChildren || [])
    .filter((p) => p.type === 'parameter_declaration' || p.type === 'optional_parameter_declaration')
    .map((p, i) => {
      const nameNode = declaredName(p.childForFieldName('declarator'));
      // the type is everything written before the name: "const vector<int>&", "int*" ...
      const type = nameNode ? code.slice(p.startIndex, nameNode.startIndex).trim() : p.text;
      const optional = p.type === 'optional_parameter_declaration';
      return { name: nameNode?.text ?? `arg${i + 1}`, type, hasDefault: optional };
    });
  const baseType = fn.childForFieldName('type')?.text ?? null;
  return { name, className, params, returnType: baseType === null ? null : baseType + suffix, line: fn.startPosition.row + 1 };
}

/**
 * C++: entries = public methods of classes/structs and free functions. `main` only marks a program.
 */
function inspectCpp(code) {
  return withTree('cpp', code, (root) => {
    const entries = [];
    const called = new Set();
    let hasMain = false;

    const collectCalls = (fn, ownName) => {
      for (const call of fn.descendantsOfType('call_expression')) {
        const callee = call.childForFieldName('function');
        const name = callee?.type === 'field_expression' ? callee.childForFieldName('field')?.text : callee?.text;
        if (name && name !== ownName) called.add(name.split('::').pop());
      }
    };

    const handleFunction = (fn, className, isPublic) => {
      const info = describe(fn, code, className);
      if (!info) return;
      if (!className && info.name === 'main') { hasMain = true; return; }
      info.isPrivate = !isPublic;
      entries.push(info);
      collectCalls(fn, info.name);
    };

    for (const node of root.namedChildren) {
      if (node.type === 'function_definition') {
        handleFunction(node, null, true);
      } else if (node.type === 'class_specifier' || node.type === 'struct_specifier') {
        const className = node.childForFieldName('name')?.text;
        const body = node.childForFieldName('body');
        if (!className || !body) continue;
        let isPublic = node.type === 'struct_specifier';
        for (const member of body.namedChildren) {
          if (member.type === 'access_specifier') isPublic = member.text.startsWith('public');
          else if (member.type === 'function_definition') handleFunction(member, className, isPublic);
        }
      }
    }
    // Only public methods (and free functions) are offered as entry points; private ones are helpers.
    const visible = entries.filter((e) => !e.isPrivate);
    return { entries: rank(visible, called), scriptLike: hasMain };
  });
}

module.exports = { inspectCpp };
