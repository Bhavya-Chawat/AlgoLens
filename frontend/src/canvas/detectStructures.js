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

function findMainArray(uniqueArrays) {
  let best = null;
  let bestLen = -1;
  for (const arrObj of uniqueArrays) {
    const name = arrObj.name;
    const val = arrObj.info.value;
    if (!Array.isArray(val) && typeof val !== 'string') continue;
    
    // Prefer names that sound like main input arrays
    const isMain = /^(nums|arr|array|a|s|list|data|input|grid|matrix|board)$/.test(name);
    const len = val.length;
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
    } else if (typeof val === 'string' && isNaN(val) && val.length > 0) {
      // Convert standard strings to character arrays for visualization
      effectiveVal = val.split('');
    }

    if (Array.isArray(effectiveVal)) {
      const is2D = effectiveVal.length > 0 && Array.isArray(effectiveVal[0]);
      
      // Graph detection: 2D array named adj/graph/g
      if (is2D && /^(adj|graph|g)$/.test(nameLower)) {
        graphs.push({ name, info: { ...info, value: effectiveVal }, is2D, type: 'matrix' });
      }
      // Stack detection
      else if (/^(stack|st)$/.test(nameLower) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('stack'))) {
        const isMonotonic = /monotonic/.test(nameLower) || frame?.dataStructureState?.type === 'monotonic_stack';
        stacks.push({ name, info: { ...info, value: effectiveVal }, isMonotonic });
      }
      // Queue detection
      else if (/^(queue|q|dq|deque)$/.test(nameLower) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('queue')) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('deque'))) {
        const isMonotonic = /monotonic/.test(nameLower) || frame?.dataStructureState?.type === 'monotonic_queue';
        queues.push({ name, info: { ...info, value: effectiveVal }, isMonotonic });
      }
      // Tree (Segment tree / Heap)
      else if (!is2D && (frame?.dataStructureState?.type === 'segment_tree' || frame?.dataStructureState?.type === 'priority_queue' || /^(heap|pq|segtree)$/.test(nameLower))) {
        trees.push({ name, info: { ...info, value: effectiveVal }, isArrayBased: true, type: frame?.dataStructureState?.type || 'priority_queue' });
      }
      // Fenwick Tree
      else if (!is2D && (frame?.dataStructureState?.type === 'fenwick_tree' || /^(bit|fenwick)$/.test(nameLower))) {
        arrays.push({ name, info: { ...info, value: effectiveVal }, is2D: false, isFenwick: true });
      }
      // Standard array
      else {
        arrays.push({ name, info: { ...info, value: effectiveVal }, is2D });
      }
    } else if (isObject(effectiveVal)) {
      const isAiTree = frame?.dataStructureState?.type === 'binary_tree';
      const isAiList = frame?.dataStructureState?.type === 'linked_list';

      // Check for Linked List (has 'next' or AI says it's a list)
      if ('next' in effectiveVal || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('listnode')) || (info.type && info.type.toLowerCase().includes('listnode')) || (isAiList && 'val' in effectiveVal && Object.keys(effectiveVal).length <= 3)) {
        linkedLists.push({ name, info: { ...info, value: effectiveVal } });
      } 
      // Check for Tree (has 'left' or 'right' or AI says it's a tree)
      else if (('left' in effectiveVal || 'right' in effectiveVal || 'children' in effectiveVal) || (effectiveVal.__class__ && effectiveVal.__class__.toLowerCase().includes('treenode')) || (info.type && info.type.toLowerCase().includes('treenode')) || (isAiTree && 'val' in effectiveVal && Object.keys(effectiveVal).length <= 3) || ('val' in effectiveVal && Object.keys(effectiveVal).length === 1)) {
        trees.push({ name, info: { ...info, value: effectiveVal } });
      }
      // Check for Adjacency List Graph (dict/hashmap where values are arrays)
      else if (((info.type || '') === 'dict' || !effectiveVal.__class__) && Object.values(effectiveVal).length > 0 && Array.isArray(Object.values(effectiveVal)[0])) {
        graphs.push({ name, info: { ...info, value: effectiveVal }, is2D: false, type: 'adj_list' });
      }
      // Check for Trie (Nested dict)
      else if (frame?.dataStructureState?.type === 'trie' || /^(trie|root)$/.test(nameLower) && isObject(Object.values(effectiveVal)[0])) {
        // Convert nested dict to graph adjacency list
        const adj = {};
        let nodeId = 0;
        const traverse = (node, currentId) => {
          adj[currentId] = [];
          for (const [char, child] of Object.entries(node)) {
            if (char === 'isEnd' || char === '$') continue;
            nodeId++;
            const childId = nodeId;
            adj[currentId].push({ to: childId, label: char });
            if (isObject(child)) traverse(child, childId);
          }
        };
        traverse(effectiveVal, 0);
        graphs.push({ name, info: { ...info, value: adj }, is2D: false, type: 'trie' });
      }
      // Otherwise, standard hashmap / object
      else if ((info.type || '') === 'dict' || !effectiveVal.__class__) {
        hashmaps.push({ name, info: { ...info, value: effectiveVal } });
      }
    } else if ((info.type || '') === 'int' || typeof effectiveVal === 'number') {
      integers[name] = typeof effectiveVal === 'number' ? effectiveVal : Number(effectiveVal);
    }
  }

  // Deduplicate structures referring to the same underlying data
  const deduplicate = (arr) => {
    const seen = new Set();
    return arr.filter(item => {
      const str = JSON.stringify(item.info.value);
      if (seen.has(str)) return false;
      seen.add(str);
      return true;
    });
  };
  
  const uniqueArrays = deduplicate(arrays);
  const uniqueHashmaps = deduplicate(hashmaps);
  const uniqueLinkedLists = deduplicate(linkedLists);

  // Decide on primary + secondary visualizers
  const hasRecursion = cs.length > 1;
  const mainArrayName = findMainArray(uniqueArrays);
  const mainArray     = uniqueArrays.find((a) => a.name === mainArrayName) ?? (uniqueArrays.length > 0 ? uniqueArrays[0] : null);

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
  const output = { 
    mainArray, 
    arrays: uniqueArrays, 
    stacks: deduplicate(stacks), 
    queues: deduplicate(queues), 
    graphs: deduplicate(graphs), 
    hashmaps: uniqueHashmaps, 
    linkedLists: uniqueLinkedLists, 
    trees: deduplicate(trees), 
    pointers, integers, vars 
  };

  // ─── Choose visualizer mode ────────────────────────────────
  const aiType = frame?.dataStructureState?.type;
  if (aiType && aiType !== 'generic' && aiType !== 'empty') {
    return { type: aiType, ...output };
  }

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

    if (frame.event === 'function_call' || frame.eventType === 'function_call') {
      const cs   = frame.callStack || [];
      const last = cs[cs.length - 1] || {};

      let funcName = last.name;
      let argsDesc = '';
      if (!funcName) {
         // try extracting from codeWithValues e.g. "int d = maxDepth(root.right)"
         const match = (frame.codeWithValues || '').match(/([a-zA-Z_]\w*)\s*\((.*)\)/);
         if (match) {
           funcName = match[1];
           argsDesc = match[2];
         } else {
           funcName = 'func';
         }
      }

      const node = {
        id:          nodes.length,
        name:        funcName,
        depth:       cs.length > 0 ? cs.length - 1 : openStack.length,
        children:    [],
        parentId:    openStack.length > 0 ? openStack[openStack.length - 1] : null,
        returnValue: null,
        done:        false,
        isActive:    false,
        frameIdx:    i,
        description: argsDesc || frame.explanation || frame.description || '',
      };

      if (node.parentId !== null) {
        nodes[node.parentId].children.push(node.id);
      }
      nodes.push(node);
      openStack.push(node.id);
    }

    if ((frame.event === 'return' || frame.eventType === 'return') && openStack.length > 0) {
      const topIdx = openStack[openStack.length - 1];
      nodes[topIdx].returnValue = (frame.explanation || frame.description || '').replace('↩ ', '').replace('return ', '');
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
  const NW = 180; // node width
  const NH = 52;  // node height
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
