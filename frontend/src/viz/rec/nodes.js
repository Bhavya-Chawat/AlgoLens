import { isObj, isScalar, same } from '../values.js';
import { nameRole } from '../roles.js';

/**
 * Pointer-based structures: linked lists (singly, doubly, circular), binary and n-ary trees, tries.
 * Nodes arrive as objects carrying `__id__`; the same node held by `head`, `curr` and `prev` is *one* node,
 * so the variables become labels on it instead of separate copies.
 */

const VAL_KEYS = ['val', 'value', 'data', 'key', 'name', 'label', 'letter', 'char', 'ch'];
const END_KEYS = new Set(['$', '#', 'end', 'isEnd', 'is_end', 'isWord', 'is_word', 'word', '*', 'terminal', 'leaf']);

const isRefObj = (o) => isObj(o) && ('__ref__' in o || '__cycle__' in o);
export const isNodeRecord = (o) => isObj(o) && '__id__' in o && !isRefObj(o)
  && ('next' in o || 'left' in o || 'right' in o || 'children' in o || 'neighbors' in o || 'neighbours' in o || 'prev' in o);

function refId(x) {
  if (!isObj(x)) return null;
  if ('__ref__' in x) return x.__ref__;
  if ('__cycle__' in x) return x.__cycle__;
  if ('__id__' in x) return x.__id__;
  return null;
}

function valueOf(o) {
  for (const k of VAL_KEYS) if (k in o && isScalar(o[k])) return o[k];
  for (const k of VAL_KEYS) if (k in o) return JSON.stringify(o[k]).slice(0, 12);
  return null;
}

/** Walk any value and register every node object found, with its structural links as ids. */
export function collectNodes(values, table = new Map()) {
  const walk = (o, depth) => {
    if (depth > 400) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
    if (!isObj(o)) return;
    if (!isNodeRecord(o)) {
      // wrappers (`trie.root`, a dict that holds nodes): look inside
      if (!isRefObj(o)) for (const x of Object.values(o)) walk(x, depth + 1);
      return;
    }
    if (table.has(o.__id__) && table.get(o.__id__).full) return;
    const rec = {
      id: o.__id__, cls: o.__class__ || 'Node', val: valueOf(o), full: true,
      next: null, prev: null, left: null, right: null, children: [], neighbors: [], cycleNext: false,
      extra: {},
    };
    table.set(rec.id, rec);
    if ('next' in o && o.next !== null) { rec.next = refId(o.next); rec.cycleNext = isObj(o.next) && '__cycle__' in o.next; }
    if ('prev' in o && o.prev !== null) rec.prev = refId(o.prev);
    if ('left' in o && o.left !== null) rec.left = refId(o.left);
    if ('right' in o && o.right !== null) rec.right = refId(o.right);
    rec.hasLeftField = 'left' in o;
    rec.hasRightField = 'right' in o;
    const ch = o.children;
    if (Array.isArray(ch)) ch.forEach((c, i) => { if (c !== null) rec.children.push({ key: String(i), id: refId(c) }); });
    else if (isObj(ch)) for (const [k, c] of Object.entries(ch)) if (c !== null && k !== '…') rec.children.push({ key: k, id: refId(c) });
    const around = o.neighbors ?? o.neighbours;
    if (Array.isArray(around)) around.forEach((c) => { if (c !== null && refId(c) !== null) rec.neighbors.push(refId(c)); });
    for (const [k, x] of Object.entries(o)) {
      if (k.startsWith('__') || ['next', 'prev', 'left', 'right', 'children', ...VAL_KEYS].includes(k)) continue;
      if (isScalar(x)) rec.extra[k] = x;
    }
    // recurse into nested full nodes
    for (const k of ['next', 'prev', 'left', 'right']) if (isNodeRecord(o[k])) walk(o[k], depth + 1);
    if (Array.isArray(ch)) ch.forEach((c) => walk(c, depth + 1));
    else if (isObj(ch)) Object.values(ch).forEach((c) => walk(c, depth + 1));
    for (const [k, x] of Object.entries(o)) if (!['next', 'prev', 'left', 'right', 'children'].includes(k) && !k.startsWith('__')) walk(x, depth + 1);
  };
  values.forEach((v) => walk(v, 0));
  return table;
}

function shapeOf(table) {
  let lr = false;
  let kids = false;
  let nextCount = 0;
  let strKeys = 0;
  let kidCount = 0;
  for (const r of table.values()) {
    if (r.hasLeftField || r.hasRightField || r.left !== null || r.right !== null) lr = true;
    if (r.children.length) kids = true;
    if (r.next !== null) nextCount += 1;
    for (const c of r.children) { kidCount += 1; if (Number.isNaN(Number(c.key))) strKeys += 1; }
  }
  if (lr) return 'binary';
  if (kids) return kidCount && strKeys / kidCount > 0.5 ? 'trie' : 'nary';
  if ([...table.values()].some((r) => r.neighbors.length)) return 'graph';
  if (nextCount || [...table.values()].some((r) => r.prev !== null)) return 'list';
  return null;
}

function rootsOf(table, order) {
  const child = new Set();
  for (const r of table.values()) {
    for (const x of [r.next, r.left, r.right, ...r.children.map((c) => c.id)]) if (x !== null && x !== undefined) child.add(x);
  }
  let roots = [...table.values()].filter((r) => !child.has(r.id)).map((r) => r.id);
  if (!roots.length && table.size) roots = [order[0] ?? [...table.keys()][0]]; // a pure cycle
  return roots;
}

function sameRecord(a, b) {
  return a && b && a.val === b.val && a.next === b.next && a.prev === b.prev && a.left === b.left && a.right === b.right
    && same(a.children, b.children) && same(a.extra, b.extra);
}

/** Does this value look like a trie built from nested dicts? */
export function trieFromDict(value) {
  if (!isObj(value) || '__id__' in value || '__class__' in value) return null;
  const keys = Object.keys(value).filter((k) => k !== '…');
  if (!keys.length) return null;
  let nested = 0;
  let nodes = 0;
  const out = [{ id: '', parent: null, ch: '', end: false }];
  const walk = (obj, id, depth) => {
    if (depth > 40) return true;
    for (const [k, v] of Object.entries(obj)) {
      if (k === '…') continue;
      if (END_KEYS.has(k) && !isObj(v)) { out.find((n) => n.id === id).end = Boolean(v); continue; }
      if (!isObj(v) || '__id__' in v) return false;
      if (k.length !== 1 && !(k.length <= 2)) return false;
      const cid = `${id}${k}`;
      out.push({ id: cid, parent: id, ch: k, end: false });
      nested += 1;
      nodes += 1;
      if (nodes > 400) return false;
      if (!walk(v, cid, depth + 1)) return false;
    }
    return true;
  };
  if (!walk(value, '', 0) || nested < 1) return null;
  return out;
}

export function recognizeNodes(ctx) {
  const out = [];
  const roots = [];
  const nodeVars = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name)) continue;
    if (isNodeRecord(v.value) || isRefObj(v.value)) { roots.push(v.value); nodeVars.push(v); continue; }
    if (Array.isArray(v.value) && v.value.some(isNodeRecord)) { roots.push(v.value); nodeVars.push(v); continue; }
    if (isObj(v.value) && v.value.__class__ && Object.values(v.value).some((x) => isNodeRecord(x) || (Array.isArray(x) && x.some(isNodeRecord)))) { roots.push(v.value); }
  }
  if (!roots.length) return out;

  const table = collectNodes(roots);
  if (!table.size) return out;
  const shape = shapeOf(table);
  if (!shape) return out;
  const order = [];
  for (const v of nodeVars) { const id = isNodeRecord(v.value) ? v.value.__id__ : null; if (id !== null) order.push(id); }

  // labels: variables that point into the structure (or did, and are now null)
  const labels = [];
  const seenNames = new Set();
  for (const v of ctx.vars.values()) {
    const p = ctx.profile(v.name);
    const base = v.name.replace(/^(self|this)\./, '');
    if (seenNames.has(base)) continue;
    if (isNodeRecord(v.value) || isRefObj(v.value)) {
      const id = refId(v.value);
      if (table.has(id)) { labels.push({ name: v.name, id }); seenNames.add(base); }
    } else if (v.value === null && p.nodeRef && !Array.isArray(v.value)) {
      labels.push({ name: v.name, id: null });
      seenNames.add(base);
    }
  }

  // what changed in this step: nodes whose links or value differ from the previous values of changed variables
  const prevTable = new Map();
  for (const v of nodeVars) if (v.changed && v.prev !== undefined) collectNodes([v.prev], prevTable);
  const changed = [];
  for (const rec of table.values()) if (prevTable.has(rec.id) && !sameRecord(rec, prevTable.get(rec.id))) changed.push(rec.id);
  // nodes sitting in a stack / queue variable
  const pending = new Set();
  for (const v of nodeVars) if (Array.isArray(v.value)) for (const x of v.value) if (isNodeRecord(x) || isRefObj(x)) pending.add(refId(x));

  const rootIds = rootsOf(table, order);
  const claimedNames = nodeVars.map((v) => v.name);
  const nodes = Object.fromEntries([...table.values()].map((r) => [r.id, r]));
  const base = { nodes, roots: rootIds, labels, changed, pending: [...pending] };
  const title = labels.find((l) => l.id !== null)?.name.replace(/^(self|this)\./, '') || 'nodes';

  // variables that hold the structure by value but are not lists of nodes get claimed; node lists stay
  // available for the stack/queue panels
  const claim = nodeVars.filter((v) => !Array.isArray(v.value)).map((v) => v.name);
  const id = `${shape}:${title}`;
  ctx.claim(id, ...claim);
  void claimedNames;
  if (shape === 'graph') {
    // nodes that hold their neighbours: drawn as an ordinary graph (the node's value is its label)
    const ids = [...table.keys()].map(String);
    const edges = [];
    for (const r of table.values()) for (const n of r.neighbors) edges.push({ from: String(r.id), to: String(n) });
    const have = new Set(edges.map((e) => `${e.from}>${e.to}`));
    const directed = !edges.every((e) => have.has(`${e.to}>${e.from}`));
    const here = labels.filter((l) => l.id !== null);
    const cur = here.find((l) => nameRole(l.name, 'currentNode') >= 1) || here[0];
    const nxt = here.find((l) => l !== cur && nameRole(l.name, 'nextNode') >= 1) || here.find((l) => l !== cur);
    const text = Object.fromEntries([...table.values()].map((r) => [String(r.id), r.val === null || r.val === undefined ? String(r.id) : String(r.val)]));
    const pendingIds = [...pending].map(String);
    out.push(ctx.emit({
      id: `graph:${title}`, lens: 'graph', title, vars: claim, priority: 92,
      data: {
        name: title, nodes: ids, edges, directed, weighted: false, source: 'objects', labels: text, changed: changed.length > 0,
        edgeNow: cur && nxt ? (directed ? `${cur.id}>${nxt.id}` : [String(cur.id), String(nxt.id)].sort().join('-')) : null,
        universe: { nodes: ids, edges },
        overlays: {
          visited: [], dist: {}, parent: {}, colors: {}, indegree: {}, order: {}, extra: {}, frontier: pendingIds,
          current: cur ? { id: String(cur.id), name: cur.name } : null, next: nxt ? { id: String(nxt.id), name: nxt.name } : null, chosen: [], names: {},
        },
      },
    }));
  } else if (shape === 'list') {
    out.push(ctx.emit({ id, lens: 'linked', title, vars: claim, priority: 90, data: { ...base, doubly: [...table.values()].some((r) => r.prev !== null) } }));
  } else if (shape === 'trie') {
    out.push(ctx.emit({ id, lens: 'trie', title, vars: claim, priority: 86, data: { ...base, fromDict: false } }));
  } else {
    out.push(ctx.emit({ id, lens: 'tree', title, vars: claim, priority: 90, data: { ...base, kind: shape === 'binary' ? 'binary' : 'nary' } }));
  }
  return out;
}

/** Tries written as nested dictionaries. */
export function recognizeDictTries(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || !isObj(v.value)) continue;
    const nodes = trieFromDict(v.value);
    if (!nodes || nodes.length < 3) continue;
    // the variable that walks the trie: a sub-dict of it (node = node.setdefault(ch, {}))
    let current = null;
    for (const c of ctx.vars.values()) {
      if (c === v || !isObj(c.value) || c.value.__class__) continue;
      if (c.value === v.value || nameRole(c.name, 'trie') < 1 && !['node', 'cur', 'curr', 'current', 'cursor', 'temp', 'p'].includes(c.base)) continue;
      const matches = nodes.filter((n) => {
        let sub = v.value;
        for (const ch of n.id) { sub = isObj(sub) ? sub[ch] : undefined; if (sub === undefined) return false; }
        return same(sub, c.value);
      });
      if (matches.length) { current = { name: c.name, id: matches[matches.length - 1].id }; break; }
    }
    const prevNodes = v.changed && isObj(v.prev) ? trieFromDict(v.prev) : null;
    const prevIds = new Set(prevNodes ? prevNodes.map((n) => n.id) : []);
    const added = prevNodes ? nodes.filter((n) => !prevIds.has(n.id)).map((n) => n.id) : [];
    ctx.claim(`trie:${v.name}`, v.name, current?.name);
    out.push(ctx.emit({
      id: `trie:${v.name}`, lens: 'trie', title: v.name, vars: [v.name], priority: 86,
      data: { fromDict: true, trie: nodes, current, added },
    }));
  }
  return out;
}
