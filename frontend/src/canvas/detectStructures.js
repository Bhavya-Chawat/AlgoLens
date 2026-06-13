// ============================================================
// STRUCTURE DETECTION
// Analyses a single TraceFrame's variables + callStack
// and returns a description of what to render.
// ============================================================

const POINTER_NAMES = new Set([
  'left', 'right', 'mid', 'slow', 'fast',
  'i', 'j', 'k', 'start', 'end', 'lo', 'hi',
  'ptr', 'head', 'curr', 'prev', 'next', 'p', 'q',
  'l', 'r', 'top', 'bot', 'low', 'high',
]);

// Returns the "best" array variable to highlight (largest / most likely main array)
function findMainArray(variables) {
  let best = null;
  let bestLen = -1;
  for (const [name, info] of Object.entries(variables)) {
    if (!Array.isArray(info.value)) continue;
    // Prefer names that sound like main input arrays
    const isMain = /^(nums|arr|array|a|s|list|data|input|grid|matrix|board)$/.test(name);
    const len = info.value.length;
    if (len > bestLen || (isMain && len >= bestLen)) {
      best = name;
      bestLen = len;
    }
  }
  return best;
}

export function detectStructures(frame) {
  if (!frame) return { type: 'empty' };

  const vars   = frame.variables || {};
  const cs     = frame.callStack || [];

  // Collect variable types
  const arrays   = [];
  const stacks   = [];
  const queues   = [];
  const graphs   = [];
  const hashmaps = [];
  const linkedLists = [];
  const trees = [];
  const integers = {};

  // Helper to determine object shape
  const isObject = (val) => val !== null && typeof val === 'object' && !Array.isArray(val);

  for (const [name, info] of Object.entries(vars)) {
    // Handle both {value, type} shape and raw values
    const val = info.value !== undefined ? info.value : info;
    const nameLower = name.toLowerCase();

    // Try to coerce string numbers
    let effectiveVal = val;
    if (typeof val === 'string' && !isNaN(val) && val.trim() !== '') {
      effectiveVal = Number(val);
    }

    if (Array.isArray(effectiveVal)) {
      const is2D = effectiveVal.length > 0 && Array.isArray(effectiveVal[0]);
      
      // Graph detection: 2D array named adj/graph/g
      if (is2D && /^(adj|graph|g)$/.test(nameLower)) {
        graphs.push({ name, info: { ...info, value: effectiveVal }, is2D, type: 'matrix' });
      }
      // Stack detection
      else if (/^(stack|st)$/.test(nameLower) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('stack'))) {
        stacks.push({ name, info: { ...info, value: effectiveVal } });
      }
      // Queue detection
      else if (/^(queue|q|dq|deque)$/.test(nameLower) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('queue')) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('deque'))) {
        queues.push({ name, info: { ...info, value: effectiveVal } });
      }
      // Standard array
      else {
        arrays.push({ name, info: { ...info, value: effectiveVal }, is2D });
      }
    } else if (isObject(effectiveVal)) {
      // Check for Linked List (has 'next')
      if ('next' in effectiveVal || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('listnode'))) {
        linkedLists.push({ name, info: { ...info, value: effectiveVal } });
      } 
      // Check for Tree (has 'left' and 'right' or 'children')
      else if (('left' in effectiveVal && 'right' in effectiveVal) || 'children' in effectiveVal || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('treenode'))) {
        trees.push({ name, info: { ...info, value: effectiveVal } });
      }
      // Check for Adjacency List Graph (dict/hashmap where values are arrays)
      else if (((info.type || '') === 'dict' || !effectiveVal.__class__) && Object.values(effectiveVal).length > 0 && Array.isArray(Object.values(effectiveVal)[0])) {
        graphs.push({ name, info: { ...info, value: effectiveVal }, is2D: false, type: 'adj_list' });
      }
      // Otherwise, standard hashmap / object
      else if ((info.type || '') === 'dict' || !effectiveVal.__class__) {
        hashmaps.push({ name, info: { ...info, value: effectiveVal } });
      }
    } else if ((info.type || '') === 'int' || typeof effectiveVal === 'number') {
      integers[name] = typeof effectiveVal === 'number' ? effectiveVal : Number(effectiveVal);
    }
  }

  // Decide on primary + secondary visualizers
  const hasRecursion = cs.length > 1;
  const mainArrayName = findMainArray(vars);
  const mainArray     = arrays.find((a) => a.name === mainArrayName) ?? (arrays.length > 0 ? arrays[0] : null);

  const pointers = {};
  if (mainArray) {
    const arrLen = mainArray.info.value.length;
    for (const [name, val] of Object.entries(integers)) {
      if (POINTER_NAMES.has(name) && Number.isInteger(val) && val >= -1 && val < arrLen + 2) {
        pointers[name] = val;
      }
    }
  }

  // Base output obj
  const output = { mainArray, arrays, stacks, queues, graphs, hashmaps, linkedLists, trees, pointers, integers, vars };

  // ─── Choose visualizer mode ────────────────────────────────
  if (hasRecursion) {
    return { type: 'recursion', ...output };
  }

  if (graphs.length > 0) {
    return { type: 'graph', ...output };
  }

  if (trees.length > 0) {
    return { type: 'tree', ...output };
  }

  if (linkedLists.length > 0) {
    return { type: 'linked_list', ...output };
  }
  
  if (stacks.length > 0 || queues.length > 0) {
    return { type: 'stack_queue', ...output };
  }

  if (mainArray && hashmaps.length > 0) {
    return { type: 'array_hashmap', ...output };
  }

  if (mainArray) {
    return { type: 'array', ...output };
  }

  if (hashmaps.length > 0) {
    return { type: 'hashmap', ...output };
  }

  return { type: 'generic', ...output };
}

// Build the full recursion tree from trace[0..maxFrame]
export function buildCallTree(trace, maxFrame) {
  const nodes = [];
  const openStack = []; // indices into nodes[]

  const limit = Math.min(maxFrame, trace.length - 1);

  for (let i = 0; i <= limit; i++) {
    const frame = trace[i];

    if (frame.eventType === 'function_call') {
      const cs   = frame.callStack || [];
      const last = cs[cs.length - 1] || {};

      const node = {
        id:          nodes.length,
        name:        last.name ?? '?',
        depth:       cs.length - 1,
        children:    [],
        parentId:    openStack.length > 0 ? openStack[openStack.length - 1] : null,
        returnValue: null,
        done:        false,
        isActive:    false,
        frameIdx:    i,
        description: frame.description,
      };

      if (node.parentId !== null) {
        nodes[node.parentId].children.push(node.id);
      }
      nodes.push(node);
      openStack.push(node.id);
    }

    if (frame.eventType === 'return' && openStack.length > 0) {
      const topIdx = openStack[openStack.length - 1];
      nodes[topIdx].returnValue = frame.description.replace('↩ ', '').replace('return ', '');
      nodes[topIdx].done        = true;
      openStack.pop();
    }
  }

  // Active = last open
  if (openStack.length > 0) {
    nodes[openStack[openStack.length - 1]].isActive = true;
  }

  const roots = nodes.filter((n) => n.parentId === null);
  return { nodes, roots };
}

// Compute SVG layout positions for tree nodes
export function layoutTree(nodes, roots) {
  const NW = 148; // node width
  const NH = 44;  // node height
  const VG = 56;  // vertical gap
  const HG = 14;  // horizontal gap

  function subW(id) {
    const n = nodes[id];
    if (!n.children.length) return NW;
    const cw = n.children.reduce((sum, cid) => sum + subW(cid) + HG, -HG);
    return Math.max(NW, cw);
  }

  function place(id, left, top) {
    const n = nodes[id];
    if (!n.children.length) {
      n.x = left;
      n.y = top;
      return;
    }
    const childWidths = n.children.map(subW);
    const totalCW     = childWidths.reduce((a, b) => a + b, 0) + (n.children.length - 1) * HG;
    n.x = left + (totalCW - NW) / 2;
    n.y = top;
    let cx = left;
    n.children.forEach((cid, ci) => {
      place(cid, cx, top + NH + VG);
      cx += childWidths[ci] + HG;
    });
  }

  let x = 0;
  roots.forEach((r) => {
    place(r.id, x, 0);
    x += subW(r.id) + HG;
  });

  return { NW, NH, VG, HG };
}
