import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

const traverse = traverseModule.default ?? traverseModule;
const generate = generateModule.default ?? generateModule;

/**
 * Source -> instrumented source.
 *
 * What gets injected (all marked `_al` so it is never instrumented twice):
 *   function entry   const __f = __al.e("name", line, {params}, this);   + try/catch/finally
 *   every statement  __al.s(line, { get a(){return a}, ... }, this);      (about to run `line`)
 *   return           return __al.ret(__f, line, value, {vars});
 *   loop bodies      a step on the loop header line at the start of every iteration
 *   catch clauses    if (__al.stop(e)) throw e;                           (step limit must not be swallowed)
 *
 * Variables are passed as *getters* so a variable still in its temporal dead zone only
 * costs that one variable, never the whole step. Which variables are visible is decided by
 * Babel's scope analysis, never by guessing.
 */

export function parseSource(source) {
  return parse(source, { sourceType: 'script', errorRecovery: false });
}

// ── helpers ────────────────────────────────────────────────────────────────────────────────
const id = (name) => t.identifier(name);
const al = (member, args) => t.callExpression(t.memberExpression(id('__al'), id(member)), args);
const mark = (node) => {
  node._al = true;
  return node;
};

function varsObject(names) {
  const props = names.map((name) => {
    const getter = t.objectMethod('get', id(name), [], t.blockStatement([t.returnStatement(id(name))]));
    return mark(getter);
  });
  return mark(t.objectExpression(props));
}

const FUNCTION_INIT = /^(Function|ArrowFunction|Class)/;

function isSimpleFunctionRef(binding) {
  const bp = binding.path;
  if (bp.isFunctionDeclaration() || bp.isClassDeclaration()) return true;
  return bp.isVariableDeclarator() && FUNCTION_INIT.test(bp.node.init?.type || '');
}

function usedInside(binding, fnPath) {
  const inside = (p) => p.isDescendant(fnPath);
  return binding.referencePaths.some(inside) || binding.constantViolations.some(inside);
}

/**
 * Names that make sense to show at `atStart` inside `scope`:
 *   - everything declared in the current function (and its blocks) *before* this point
 *   - outer variables, but only those this function actually reads or writes
 * Functions and classes are skipped: they are code, not state.
 */
function visibleNames(scope, fnPath, atStart) {
  const names = [];
  const seen = new Set();
  for (let s = scope; s; s = s.parent) {
    const within = !fnPath || s.path === fnPath || s.path.isDescendant(fnPath);
    for (const [name, binding] of Object.entries(s.bindings)) {
      if (seen.has(name)) continue; // an inner binding shadows an outer one
      seen.add(name);
      if (name.startsWith('__') || binding.kind === 'module' || binding.kind === 'local') continue;
      if (isSimpleFunctionRef(binding)) continue;
      if (binding.kind !== 'param' && !(binding.identifier.start < atStart)) continue;
      if (!within && !usedInside(binding, fnPath)) continue;
      names.push(name);
    }
  }
  return names;
}

function nearestRealFunction(path) {
  let p = path.getFunctionParent();
  while (p && p.isArrowFunctionExpression()) p = p.getFunctionParent();
  return p;
}

/** `this` may be captured in methods, except derived constructors (TDZ until super()). */
function canCaptureThis(path) {
  const fn = nearestRealFunction(path);
  if (!fn || !fn.isClassMethod()) return false;
  if (fn.node.kind === 'constructor') {
    const cls = fn.parentPath?.parentPath;
    if (cls?.node?.superClass) return false;
  }
  return true;
}

function functionName(path) {
  const { node, parent } = path;
  if (node.id?.name) return node.id.name;
  if (path.isClassMethod() || path.isObjectMethod()) return node.key?.name || node.key?.value || 'method';
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
  if (t.isAssignmentExpression(parent)) {
    const left = parent.left;
    if (t.isIdentifier(left)) return left.name;
    if (t.isMemberExpression(left) && t.isIdentifier(left.property)) return left.property.name;
  }
  if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) return parent.key.name;
  return 'anonymous';
}

const stepable = (node) =>
  !node._al &&
  !t.isFunctionDeclaration(node) &&
  !t.isClassDeclaration(node) &&
  !t.isEmptyStatement(node) &&
  !t.isBlockStatement(node);

// ── the instrumenter ───────────────────────────────────────────────────────────────────────
/**
 * @param {string} source
 * @param {{ mode: 'function' | 'script' }} options
 * @returns {{ code: string, declares: Set<string> }}
 */
export function instrument(source, { mode = 'function' } = {}) {
  const ast = parseSource(source);
  const declares = new Set();

  traverse(ast, {
    Program(path) {
      Object.keys(path.scope.bindings).forEach((name) => declares.add(name));
      path.stop();
    },
  });

  const makeStep = (stmt, scope, fnPath, withThis, line = stmt.loc?.start.line ?? 0, at = stmt.start) => {
    const args = [t.numericLiteral(line), varsObject(visibleNames(scope, fnPath, at))];
    if (withThis) args.push(t.thisExpression());
    return mark(t.expressionStatement(al('s', args)));
  };

  const instrumentList = (list, path) => {
    const fnPath = path.getFunctionParent();
    const withThis = canCaptureThis(path);
    const out = [];
    for (const stmt of list) {
      if (stepable(stmt)) out.push(makeStep(stmt, path.scope, fnPath, withThis));
      out.push(stmt);
    }
    return out;
  };

  const asBlock = (stmt) => (t.isBlockStatement(stmt) ? stmt : t.blockStatement([stmt]));

  traverse(ast, {
    enter(path) {
      if (path.node._al) path.skip(); // generated code is never instrumented again
    },

    // Async functions and generators suspend mid-body, which would corrupt the call stack
    // we record: leave them untouched (they still run, they just are not stepped through).
    Function: {
      enter(path) {
        if (path.node.async || path.node.generator) {
          path.skip();
          return;
        }
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([t.returnStatement(path.node.body)]);
        }
      },
      exit(path) {
        const node = path.node;
        if (node._al || node.async || node.generator) return;
        const params = Object.entries(path.scope.bindings)
          .filter(([, b]) => b.kind === 'param')
          .map(([name]) => name);
        const entryArgs = [
          t.stringLiteral(functionName(path)),
          t.numericLiteral(node.loc?.start.line ?? 0),
          varsObject(params),
        ];
        if (canCaptureThis(path)) entryArgs.push(t.thisExpression());

        const frame = mark(t.variableDeclaration('const', [t.variableDeclarator(id('__f'), al('e', entryArgs))]));
        const guarded = mark(
          t.tryStatement(
            t.blockStatement(node.body.body),
            t.catchClause(id('__e'), t.blockStatement([t.throwStatement(al('x', [id('__f'), id('__e')]))])),
            t.blockStatement([t.expressionStatement(al('r', [id('__f')]))]),
          ),
        );
        node.body = t.blockStatement([frame, guarded], node.body.directives);
      },
    },

    ReturnStatement(path) {
      const fnPath = path.getFunctionParent();
      if (!fnPath || fnPath.node._al || fnPath.node.async || fnPath.node.generator) return;
      const value = path.node.argument || id('undefined');
      path.node.argument = al('ret', [
        id('__f'),
        t.numericLiteral(path.node.loc?.start.line ?? 0),
        value,
        varsObject(visibleNames(path.scope, fnPath, path.node.start)),
      ]);
    },

    CatchClause(path) {
      if (!path.node.param) path.node.param = id('__c');
      const name = path.node.param.name || '__c';
      if (!t.isIdentifier(path.node.param)) return;
      path.node.body.body.unshift(
        mark(t.ifStatement(al('stop', [id(name)]), t.throwStatement(id(name)))),
      );
    },

    // Every iteration starts with a step on the loop header line (like a debugger would show).
    'ForStatement|ForInStatement|ForOfStatement|WhileStatement|DoWhileStatement'(path) {
      const node = path.node;
      node.body = asBlock(node.body);
      const fnPath = path.getFunctionParent();
      const header = makeStep(node, path.scope, fnPath, canCaptureThis(path), node.loc?.start.line ?? 0, node.body.start ?? node.end);
      node.body.body.unshift(header);
    },

    IfStatement(path) {
      const node = path.node;
      node.consequent = asBlock(node.consequent);
      if (node.alternate && !t.isBlockStatement(node.alternate) && !t.isIfStatement(node.alternate)) {
        node.alternate = asBlock(node.alternate);
      }
    },

    BlockStatement(path) {
      const fn = path.getFunctionParent();
      // function bodies handled like any block; skip blocks owned by generated/untouched functions
      if (fn && (fn.node._al || fn.node.async || fn.node.generator)) return;
      path.node.body = instrumentList(path.node.body, path);
    },

    SwitchCase(path) {
      path.node.consequent = instrumentList(path.node.consequent, path);
    },

    Program: {
      exit(path) {
        if (mode !== 'script') return;
        const body = instrumentList(path.node.body, path);
        const frame = mark(t.variableDeclaration('const', [t.variableDeclarator(id('__f'), al('m', []))]));
        const guarded = mark(
          t.tryStatement(
            t.blockStatement(body),
            t.catchClause(id('__e'), t.blockStatement([t.throwStatement(al('x', [id('__f'), id('__e')]))])),
            t.blockStatement([t.expressionStatement(al('r', [id('__f')]))]),
          ),
        );
        path.node.body = [frame, guarded];
      },
    },
  });

  return { code: generate(ast, { comments: false }).code, declares };
}
