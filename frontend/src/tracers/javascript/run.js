import * as t from '@babel/types';
import { parseSource, instrument } from './instrument.js';
import { createRuntime, STOP, typeName } from './runtime.js';

/**
 * JavaScript tracer entry points (pure functions: used by the worker and by the tests).
 *   inspectJs(code)  -> { entries, scriptLike } | { error }
 *   runJs(job)       -> AlgoTrace v1 wire object (see core/frameBuilder.js)
 */

const syntaxError = (error) => ({
  type: 'SyntaxError',
  message: String(error.message).replace(/\s*\(\d+:\d+\)\s*$/, ''),
  line: error.loc?.line ?? null,
});

// ── LeetCode conveniences ──────────────────────────────────────────────────────────────────
const HELPERS = `
function ListNode(val, next) { this.val = (val === undefined ? 0 : val); this.next = (next === undefined ? null : next); }
function TreeNode(val, left, right) { this.val = (val === undefined ? 0 : val); this.left = (left === undefined ? null : left); this.right = (right === undefined ? null : right); }
`;

export function listToTree(values, Node) {
  if (!values || values.length === 0) return null;
  const nodes = values.map((v) => (v === null ? null : new Node(v)));
  const kids = [...nodes].reverse();
  const root = kids.pop();
  for (const node of nodes) {
    if (node) {
      if (kids.length) node.left = kids.pop();
      if (kids.length) node.right = kids.pop();
    }
  }
  return root;
}

export function listToLinked(values, Node) {
  let head = null;
  for (let i = (values || []).length - 1; i >= 0; i -= 1) head = new Node(values[i], head);
  return head;
}

export function treeToList(root) {
  const out = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (node === null || node === undefined) { out.push(null); continue; }
    out.push(node.val);
    queue.push(node.left, node.right);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

export function linkedToList(head) {
  const out = [];
  const seen = new Set();
  for (let n = head; n && !seen.has(n) && out.length < 10000; n = n.next) {
    seen.add(n);
    out.push(n.val);
  }
  return out;
}

function convertArg(value, typeText, ctors) {
  const text = typeText || '';
  const many = /\[\]$|^Array</.test(text);
  if (/TreeNode/.test(text) && ctors.TreeNode && Array.isArray(value)) {
    return many ? value.map((v) => (Array.isArray(v) ? listToTree(v, ctors.TreeNode) : v)) : listToTree(value, ctors.TreeNode);
  }
  if (/ListNode/.test(text) && ctors.ListNode && Array.isArray(value)) {
    return many ? value.map((v) => (Array.isArray(v) ? listToLinked(v, ctors.ListNode) : v)) : listToLinked(value, ctors.ListNode);
  }
  return value;
}

function plainResult(value) {
  try {
    if (value && typeof value === 'object') {
      if ('left' in value || 'right' in value) return treeToList(value);
      if ('next' in value && 'val' in value) return linkedToList(value);
    }
  } catch { /* not a node structure */ }
  return null;
}

// ── inspect ────────────────────────────────────────────────────────────────────────────────
function jsdocTypes(comments) {
  const types = {};
  for (const c of comments || []) {
    for (const m of c.value.matchAll(/@param\s+\{([^}]+)\}\s+\[?([\w$]+)/g)) types[m[2]] = m[1].trim();
    const ret = c.value.match(/@returns?\s+\{([^}]+)\}/);
    if (ret) types.__return = ret[1].trim();
  }
  return types;
}

function describeParams(params, types) {
  return params.map((p, i) => {
    if (t.isIdentifier(p)) return { name: p.name, type: types[p.name] ?? null, hasDefault: false };
    if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) return { name: p.left.name, type: types[p.left.name] ?? null, hasDefault: true };
    if (t.isRestElement(p) && t.isIdentifier(p.argument)) return { name: p.argument.name, type: null, hasDefault: false };
    return { name: `arg${i + 1}`, type: null, hasDefault: false };
  });
}

function describeFunction(fn, name, className, owner) {
  const types = jsdocTypes(owner?.leadingComments);
  return {
    name,
    className,
    params: describeParams(fn.params, types),
    returnType: types.__return ?? null,
    line: fn.loc?.start.line ?? 0,
    isHelper: false,
  };
}

const isFn = (n) => t.isFunctionExpression(n) || t.isArrowFunctionExpression(n);

/** A top-level call that "does work": user function, console.*, or any control-flow statement. */
function doesWorkAtTopLevel(node, defined) {
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n.type !== 'string') return;
    if (t.isFunction(n) || t.isClass(n)) return;
    if (t.isCallExpression(n)) {
      const callee = n.callee;
      const base = t.isMemberExpression(callee) ? callee.object : callee;
      const root = t.isIdentifier(base) ? base.name : t.isCallExpression(base) || t.isNewExpression(base) ? base.callee?.name : null;
      if ((t.isIdentifier(callee) && defined.has(callee.name)) || root === 'console' || defined.has(root)) {
        found = true;
        return;
      }
    }
    for (const key of t.VISITOR_KEYS[n.type] || []) {
      const child = n[key];
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(node);
  return found;
}

export function inspectJs(code) {
  let ast;
  try {
    ast = parseSource(code);
  } catch (error) {
    return { error: syntaxError(error) };
  }

  const entries = [];
  const defined = new Set();
  const called = new Set();

  const noteCalls = (n, insideFunction) => {
    if (!n || typeof n.type !== 'string') return;
    const inside = insideFunction || t.isFunction(n);
    if (inside && t.isCallExpression(n)) {
      if (t.isIdentifier(n.callee)) called.add(n.callee.name);
      else if (t.isMemberExpression(n.callee) && t.isIdentifier(n.callee.property)) called.add(n.callee.property.name);
    }
    for (const key of t.VISITOR_KEYS[n.type] || []) {
      const child = n[key];
      if (Array.isArray(child)) child.forEach((c) => noteCalls(c, inside));
      else noteCalls(child, inside);
    }
  };
  ast.program.body.forEach((s) => noteCalls(s, false));

  let scriptLike = false;
  for (const stmt of ast.program.body) {
    if (t.isFunctionDeclaration(stmt) && stmt.id) defined.add(stmt.id.name);
    else if (t.isClassDeclaration(stmt) && stmt.id) defined.add(stmt.id.name);
    else if (t.isVariableDeclaration(stmt)) {
      stmt.declarations.forEach((d) => {
        if (t.isIdentifier(d.id) && d.init && (isFn(d.init) || t.isClassExpression(d.init))) defined.add(d.id.name);
      });
    }
  }

  for (const stmt of ast.program.body) {
    if (t.isFunctionDeclaration(stmt) && stmt.id) {
      entries.push(describeFunction(stmt, stmt.id.name, null, stmt));
    } else if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) {
        if (t.isIdentifier(d.id) && d.init && isFn(d.init)) entries.push(describeFunction(d.init, d.id.name, null, stmt));
      }
      if (stmt.declarations.some((d) => d.init && doesWorkAtTopLevel(d.init, defined))) scriptLike = true;
    } else if (t.isClassDeclaration(stmt) && stmt.id) {
      for (const member of stmt.body.body) {
        if (t.isClassMethod(member) && member.kind === 'method' && t.isIdentifier(member.key)) {
          entries.push(describeFunction(member, member.key.name, stmt.id.name, member));
        }
      }
    } else if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
      const { left, right } = stmt.expression;
      // Solution.prototype.method = function (...) { }   (LeetCode's older JavaScript templates)
      if (
        isFn(right) && t.isMemberExpression(left) && t.isIdentifier(left.property) &&
        t.isMemberExpression(left.object) && t.isIdentifier(left.object.property, { name: 'prototype' }) &&
        t.isIdentifier(left.object.object)
      ) {
        entries.push(describeFunction(right, left.property.name, left.object.object.name, stmt));
      } else if (doesWorkAtTopLevel(stmt, defined)) {
        scriptLike = true;
      }
    } else if (t.isEmptyStatement(stmt) || t.isImportDeclaration(stmt)) {
      // nothing to do
    } else if (t.isExpressionStatement(stmt)) {
      if (doesWorkAtTopLevel(stmt, defined)) scriptLike = true;
    } else if (!t.isClassDeclaration(stmt)) {
      scriptLike = true; // if / for / while / try / switch at the top level
    }
  }

  entries.forEach((e) => { e.isHelper = called.has(e.name); });
  entries.sort((a, b) => Number(a.isHelper) - Number(b.isHelper) || Number(a.className !== 'Solution') - Number(b.className !== 'Solution'));
  return { entries, scriptLike };
}

// ── run ────────────────────────────────────────────────────────────────────────────────────
function pickEntry(entries, wanted) {
  if (wanted?.name) {
    return entries.find((e) => e.name === wanted.name && (!wanted.className || e.className === wanted.className)) ?? null;
  }
  return entries[0] ?? null;
}

function resolveArgs(entry, supplied, paramTypes, ctors) {
  const names = entry.params.map((p) => p.name);
  const keys = Object.keys(supplied);
  // same count but different names: fall back to the order the user typed them in
  const positional = keys.length === names.length && !names.every((n) => n in supplied) ? Object.values(supplied) : null;
  const args = [];
  entry.params.forEach((p, i) => {
    let value;
    if (p.name in supplied) value = supplied[p.name];
    else if (positional) value = positional[i];
    else if (p.hasDefault) { args.push(undefined); return; }
    else throw new TypeError(`missing argument '${p.name}' - add it in Function Arguments`);
    args.push(convertArg(value, p.type || paramTypes?.[p.name], ctors));
  });
  return args;
}

export function runJs(job) {
  const limit = job.limits?.steps ?? 20000;
  const stdoutCap = job.limits?.stdout ?? 65536;
  const wire = {
    v: 1, language: 'javascript', steps: [], truncated: false, limit,
    output: { stdout: '', result: null, resultPlain: null, error: null },
  };

  const info = inspectJs(job.code);
  if (info.error) {
    wire.output.error = info.error;
    return wire;
  }

  let mode = job.mode || 'function';
  const entry = pickEntry(info.entries, job.entry);
  if (mode === 'function' && !entry) mode = 'script';
  wire.mode = mode;
  wire.entry = entry;

  const { code: instrumented, declares } = instrument(job.code, { mode });
  const exported = new Set(['TreeNode', 'ListNode']);
  if (entry) exported.add(entry.className || entry.name);
  const epilogue = mode === 'function'
    ? `\nreturn { ${[...exported].map((n) => `${JSON.stringify(n)}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} };`
    : '';
  const prelude = [declares.has('ListNode') ? '' : HELPERS.split('\n')[1], declares.has('TreeNode') ? '' : HELPERS.split('\n')[2]].join('\n');

  const rt = createRuntime({ limit, stdoutCap });
  let factory;
  try {
    factory = new Function('__al', 'console', `${prelude}\n${instrumented}${epilogue}`);
  } catch (error) {
    wire.output.error = { type: 'InternalError', message: `could not prepare the program: ${error.message}`, line: null };
    return wire;
  }

  let returned;
  let error = null;
  const describe = (e) => {
    const isObj = e !== null && typeof e === 'object';
    return {
      type: isObj ? e.name || 'Error' : 'Error',
      message: String(isObj ? e.message : e).slice(0, 300),
      line: rt.excLineOf(e),
      e: rt.excIdOf(e),
    };
  };

  try {
    if (mode === 'script') {
      rt.enable();
      factory(rt.api, rt.console);
    } else {
      const exports = factory(rt.api, rt.console); // definitions only - untraced
      const owner = entry.className ? exports[entry.className] : exports[entry.name];
      if (typeof owner !== 'function') throw new ReferenceError(`entry point '${entry.name}' was not defined`);
      const ctors = { TreeNode: exports.TreeNode, ListNode: exports.ListNode };
      const args = resolveArgs(entry, job.args || {}, job.paramTypes, ctors);
      let target = owner;
      let self;
      if (entry.className) {
        self = new owner();
        target = self[entry.name] ?? owner.prototype?.[entry.name];
      }
      rt.enable();
      returned = target.apply(self, args);
    }
  } catch (e) {
    if (e !== STOP) error = describe(e);
  } finally {
    rt.disable();
  }

  const done = rt.result();
  wire.steps = done.steps;
  wire.truncated = done.truncated;
  wire.output.stdout = done.stdout;
  wire.output.stdoutClipped = done.stdoutClipped;
  wire.output.error = error;
  if (!error && !done.truncated && mode === 'function') {
    wire.output.result = [typeName(returned), rt.ser.ser(returned)];
    wire.output.resultPlain = plainResult(returned);
  }
  return wire;
}
