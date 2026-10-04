// JavaScript versions of examples that exist in Python. Keyed by example id; merged in ../index.js.
// (No template literals inside the programs: they are stored in template literals themselves.)

export const JAVASCRIPT_VARIANTS = {
  'reverse-linked-list': {
    args: { head: [1, 2, 3, 4, 5] },
    code: `/**
 * @param {ListNode} head
 * @return {ListNode}
 */
var reverseList = function (head) {
  let prev = null;
  let curr = head;
  while (curr) {
    const nxt = curr.next;
    curr.next = prev;
    prev = curr;
    curr = nxt;
  }
  return prev;
};
`,
  },
  'inorder-iterative': {
    args: { root: [4, 2, 6, 1, 3, 5, 7] },
    code: `/**
 * @param {TreeNode} root
 * @return {number[]}
 */
var inorderTraversal = function (root) {
  const result = [];
  const stack = [];
  let node = root;
  while (node || stack.length) {
    while (node) {
      stack.push(node);
      node = node.left;
    }
    node = stack.pop();
    result.push(node.val);
    node = node.right;
  }
  return result;
};
`,
  },
  'level-order': {
    args: { root: [3, 9, 20, null, null, 15, 7] },
    code: `/**
 * @param {TreeNode} root
 * @return {number[][]}
 */
var levelOrder = function (root) {
  if (!root) return [];
  const levels = [];
  const queue = [root];
  while (queue.length) {
    const level = [];
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const node = queue.shift();
      level.push(node.val);
      if (node.left) queue.push(node.left);
      if (node.right) queue.push(node.right);
    }
    levels.push(level);
  }
  return levels;
};
`,
  },
  trie: {
    code: `class TrieNode {
  constructor() {
    this.children = new Map();
    this.end = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.end = true;
  }

  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children.has(ch)) return false;
      node = node.children.get(ch);
    }
    return true;
  }
}

const trie = new Trie();
for (const word of ['car', 'cat', 'dog', 'do']) trie.insert(word);
console.log(trie.startsWith('ca'), trie.startsWith('dx'));
`,
  },
  lcs: {
    args: { text1: 'ABCBDAB', text2: 'BDCABA' },
    code: `function lcs(text1, text2) {
  const m = text1.length, n = text2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}
`,
  },
  kruskal: {
    args: { n: 5, edges: [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [3, 4, 6]] },
    code: `function kruskal(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  let total = 0;
  const chosen = [];
  const sorted = [...edges].sort((a, b) => a[2] - b[2]);
  for (const [u, v, w] of sorted) {
    const ru = find(u), rv = find(v);
    if (ru !== rv) {
      parent[ru] = rv;
      total += w;
      chosen.push([u, v, w]);
    }
  }
  return total;
}
`,
  },
  'topological-sort': {
    args: { n: 6, edges: [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]] },
    code: `function topologicalOrder(n, edges) {
  const graph = {};
  for (let i = 0; i < n; i++) graph[i] = [];
  const indegree = new Array(n).fill(0);
  for (const [u, v] of edges) {
    graph[u].push(v);
    indegree[v]++;
  }
  const queue = [];
  for (let i = 0; i < n; i++) if (indegree[i] === 0) queue.push(i);
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const nxt of graph[node]) {
      indegree[nxt]--;
      if (indegree[nxt] === 0) queue.push(nxt);
    }
  }
  return order;
}
`,
  },
  'number-of-islands': {
    args: { grid: [['1', '1', '0', '0'], ['1', '0', '0', '1'], ['0', '0', '1', '1'], ['0', '0', '0', '0']] },
    code: `function numIslands(grid) {
  const rows = grid.length, cols = grid[0].length;
  const seen = new Set();
  let islands = 0;
  function flood(r, c) {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    if (grid[r][c] !== '1' || seen.has(r + ',' + c)) return;
    seen.add(r + ',' + c);
    flood(r + 1, c);
    flood(r - 1, c);
    flood(r, c + 1);
    flood(r, c - 1);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '1' && !seen.has(r + ',' + c)) {
        islands++;
        flood(r, c);
      }
    }
  }
  return islands;
}
`,
  },
  'n-queens': {
    args: { n: 4 },
    code: `function solveNQueens(n) {
  const board = Array.from({ length: n }, () => new Array(n).fill('.'));
  const cols = new Set(), diag1 = new Set(), diag2 = new Set();
  const solutions = [];
  function place(row) {
    if (row === n) {
      solutions.push(board.map((r) => r.join('')));
      return;
    }
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag1.has(row - col) || diag2.has(row + col)) continue;
      board[row][col] = 'Q';
      cols.add(col); diag1.add(row - col); diag2.add(row + col);
      place(row + 1);
      board[row][col] = '.';
      cols.delete(col); diag1.delete(row - col); diag2.delete(row + col);
    }
  }
  place(0);
  return solutions;
}
`,
  },
  'monotonic-stack': {
    args: { nums: [2, 1, 2, 4, 3] },
    code: `function nextGreater(nums) {
  const result = new Array(nums.length).fill(-1);
  const stack = [];
  for (let i = 0; i < nums.length; i++) {
    while (stack.length && nums[stack[stack.length - 1]] < nums[i]) {
      result[stack.pop()] = nums[i];
    }
    stack.push(i);
  }
  return result;
}
`,
  },
  permutations: {
    args: { nums: [1, 2, 3] },
    code: `function permute(nums) {
  const result = [];
  const path = [];
  const used = new Array(nums.length).fill(false);
  function backtrack() {
    if (path.length === nums.length) {
      result.push([...path]);
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(nums[i]);
      backtrack();
      path.pop();
      used[i] = false;
    }
  }
  backtrack();
  return result;
}
`,
  },
  'merge-sort': {
    args: { nums: [6, 3, 8, 1, 9, 2] },
    code: `function mergeSort(nums) {
  if (nums.length <= 1) return nums;
  const mid = Math.floor(nums.length / 2);
  const left = mergeSort(nums.slice(0, mid));
  const right = mergeSort(nums.slice(mid));
  const merged = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) merged.push(left[i++]);
    else merged.push(right[j++]);
  }
  while (i < left.length) merged.push(left[i++]);
  while (j < right.length) merged.push(right[j++]);
  return merged;
}
`,
  },
  'quick-sort': {
    args: { arr: [7, 2, 9, 4, 1, 8, 3] },
    code: `function quickSort(arr) {
  function sort(lo, hi) {
    if (lo >= hi) return;
    const pivot = arr[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (arr[j] < pivot) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        i++;
      }
    }
    [arr[i], arr[hi]] = [arr[hi], arr[i]];
    sort(lo, i - 1);
    sort(i + 1, hi);
  }
  sort(0, arr.length - 1);
  return arr;
}
`,
  },
  'heap-sift': {
    code: `function push(heap, value) {
  heap.push(value);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = Math.floor((i - 1) / 2);
    if (heap[parent] <= heap[i]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function pop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1, right = 2 * i + 2;
      let smallest = i;
      if (left < heap.length && heap[left] < heap[smallest]) smallest = left;
      if (right < heap.length && heap[right] < heap[smallest]) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}

const heap = [];
for (const value of [9, 4, 7, 1, 8, 2]) push(heap, value);
console.log(pop(heap), pop(heap));
`,
  },
  'sliding-window': {
    args: { s: 'abcabcbb' },
    code: `function lengthOfLongestSubstring(s) {
  const last = new Map();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (last.has(ch) && last.get(ch) >= left) left = last.get(ch) + 1;
    last.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
`,
  },
  knapsack: {
    args: { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], capacity: 7 },
    code: `function knapsack(weights, values, capacity) {
  const n = weights.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (weights[i - 1] <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1]);
      }
    }
  }
  return dp[n][capacity];
}
`,
  },
  'lru-cache': {
    code: `class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }
  get(key) {
    if (!this.cache.has(key)) return -1;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  put(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }
}

const cache = new LRUCache(2);
cache.put(1, 10);
cache.put(2, 20);
cache.get(1);
cache.put(3, 30);
console.log(cache.get(2), cache.get(3));
`,
  },
};
