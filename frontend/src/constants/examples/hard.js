// Harder, multi-structure problems: several data structures cooperate in the same run.

export const HARD_EXAMPLES = [
  {
    id: 'tarjan-scc',
    title: "Tarjan's strongly connected components",
    category: 'Hard graphs',
    blurb: 'DFS with discovery/low-link numbers and an explicit stack.',
    expects: ['graph', 'calltree', 'stack'],
    python: {
      args: { graph: [[1], [2], [0, 3], [4], [5], [3], [5, 7], [6]] },
      code: `def scc(graph):
    n = len(graph)
    disc = [-1] * n
    low = [0] * n
    on_stack = [False] * n
    stack = []
    components = []
    timer = [0]

    def dfs(u):
        disc[u] = low[u] = timer[0]
        timer[0] += 1
        stack.append(u)
        on_stack[u] = True
        for v in graph[u]:
            if disc[v] == -1:
                dfs(v)
                low[u] = min(low[u], low[v])
            elif on_stack[v]:
                low[u] = min(low[u], disc[v])
        if low[u] == disc[u]:
            component = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                component.append(w)
                if w == u:
                    break
            components.append(component)

    for u in range(n):
        if disc[u] == -1:
            dfs(u)
    return components
`,
    },
  },
  {
    id: 'sliding-window-max',
    title: 'Sliding window maximum (monotonic deque)',
    category: 'Hard arrays',
    blurb: 'A deque of indices whose values are decreasing; the front is the maximum.',
    expects: ['array', 'queue'],
    python: {
      args: { nums: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 },
      code: `from collections import deque


def max_sliding_window(nums, k):
    dq = deque()
    result = []
    for i, value in enumerate(nums):
        while dq and nums[dq[-1]] <= value:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            result.append(nums[dq[0]])
    return result
`,
    },
  },
  {
    id: 'median-stream',
    title: 'Median of a data stream (two heaps)',
    category: 'Hard heaps',
    blurb: 'A max-heap for the lower half, a min-heap for the upper half.',
    expects: ['heap'],
    python: {
      args: { stream: [5, 15, 1, 3, 8, 7] },
      code: `import heapq


def running_medians(stream):
    low = []   # max-heap (stored negated)
    high = []  # min-heap
    medians = []
    for x in stream:
        heapq.heappush(low, -x)
        heapq.heappush(high, -heapq.heappop(low))
        if len(high) > len(low):
            heapq.heappush(low, -heapq.heappop(high))
        if len(low) > len(high):
            medians.append(-low[0])
        else:
            medians.append((-low[0] + high[0]) / 2)
    return medians
`,
    },
  },
  {
    id: 'word-ladder',
    title: 'Word ladder (BFS over words)',
    category: 'Hard graphs',
    blurb: 'An implicit graph: neighbours are words one letter away.',
    expects: ['queue', 'set'],
    python: {
      args: { begin: 'hit', end: 'cog', words: ['hot', 'dot', 'dog', 'lot', 'log', 'cog'] },
      code: `from collections import deque


def ladder_length(begin, end, words):
    pool = set(words)
    queue = deque([(begin, 1)])
    seen = {begin}
    while queue:
        word, steps = queue.popleft()
        if word == end:
            return steps
        for i in range(len(word)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                nxt = word[:i] + c + word[i + 1:]
                if nxt in pool and nxt not in seen:
                    seen.add(nxt)
                    queue.append((nxt, steps + 1))
    return 0
`,
    },
  },
  {
    id: 'dijkstra-grid',
    title: 'Minimum path sum (Dijkstra on a grid)',
    category: 'Hard graphs',
    blurb: 'A heap of cells, a distance grid, four neighbours.',
    expects: ['grid', 'heap'],
    python: {
      args: { grid: [[1, 3, 1, 2], [1, 5, 1, 9], [4, 2, 1, 1]] },
      code: `import heapq


def min_path(grid):
    rows, cols = len(grid), len(grid[0])
    dist = [[float('inf')] * cols for _ in range(rows)]
    dist[0][0] = grid[0][0]
    heap = [(grid[0][0], 0, 0)]
    while heap:
        d, r, c = heapq.heappop(heap)
        if d > dist[r][c]:
            continue
        for dr, dc in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                nd = d + grid[nr][nc]
                if nd < dist[nr][nc]:
                    dist[nr][nc] = nd
                    heapq.heappush(heap, (nd, nr, nc))
    return dist[rows - 1][cols - 1]
`,
    },
  },
  {
    id: 'max-flow',
    title: 'Maximum flow (Edmonds-Karp)',
    category: 'Hard graphs',
    blurb: 'Repeatedly push flow along the shortest augmenting path found by BFS.',
    expects: ['graph', 'queue'],
    python: {
      args: { source: 0, sink: 5 },
      code: `from collections import deque


def max_flow(source, sink):
    capacity = [
        [0, 16, 13, 0, 0, 0],
        [0, 0, 10, 12, 0, 0],
        [0, 4, 0, 0, 14, 0],
        [0, 0, 9, 0, 0, 20],
        [0, 0, 0, 7, 0, 4],
        [0, 0, 0, 0, 0, 0],
    ]
    n = len(capacity)
    flow = 0
    while True:
        parent = [-1] * n
        parent[source] = source
        queue = deque([source])
        while queue and parent[sink] == -1:
            u = queue.popleft()
            for v in range(n):
                if parent[v] == -1 and capacity[u][v] > 0:
                    parent[v] = u
                    queue.append(v)
        if parent[sink] == -1:
            return flow
        push = float('inf')
        v = sink
        while v != source:
            push = min(push, capacity[parent[v]][v])
            v = parent[v]
        v = sink
        while v != source:
            capacity[parent[v]][v] -= push
            capacity[v][parent[v]] += push
            v = parent[v]
        flow += push
`,
    },
  },
  {
    id: 'tsp-bitmask',
    title: 'Travelling salesman (bitmask DP)',
    category: 'Hard DP',
    blurb: 'dp[mask][i]: cheapest way to visit the set "mask" and end at i.',
    expects: ['dp', 'bits'],
    python: {
      args: { dist: [[0, 10, 15, 20], [10, 0, 35, 25], [15, 35, 0, 30], [20, 25, 30, 0]] },
      code: `def tsp(dist):
    n = len(dist)
    INF = 10 ** 9
    dp = [[INF] * n for _ in range(1 << n)]
    dp[1][0] = 0
    for mask in range(1 << n):
        for last in range(n):
            if dp[mask][last] == INF or not (mask >> last) & 1:
                continue
            for nxt in range(n):
                if (mask >> nxt) & 1:
                    continue
                new_mask = mask | (1 << nxt)
                cost = dp[mask][last] + dist[last][nxt]
                if cost < dp[new_mask][nxt]:
                    dp[new_mask][nxt] = cost
    full = (1 << n) - 1
    return min(dp[full][i] + dist[i][0] for i in range(1, n))
`,
    },
  },
  {
    id: 'matrix-chain',
    title: 'Matrix chain multiplication (interval DP)',
    category: 'Hard DP',
    blurb: 'dp[i][j] tries every split point k between i and j.',
    expects: ['dp'],
    python: {
      args: { dims: [10, 30, 5, 60, 10] },
      code: `def matrix_chain(dims):
    n = len(dims) - 1
    dp = [[0] * n for _ in range(n)]
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = float('inf')
            for k in range(i, j):
                cost = dp[i][k] + dp[k + 1][j] + dims[i] * dims[k + 1] * dims[j + 1]
                if cost < dp[i][j]:
                    dp[i][j] = cost
    return dp[0][n - 1]
`,
    },
  },
  {
    id: 'palindrome-dp',
    title: 'Longest palindromic substring (DP table)',
    category: 'Hard DP',
    blurb: 'is_pal[i][j] is true when the ends match and the inside is a palindrome.',
    expects: ['grid', 'string'],
    python: {
      args: { s: 'babad' },
      code: `def longest_palindrome(s):
    n = len(s)
    is_pal = [[False] * n for _ in range(n)]
    best = (0, 0)
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            if s[i] == s[j] and (j - i < 3 or is_pal[i + 1][j - 1]):
                is_pal[i][j] = True
                if j - i > best[1] - best[0]:
                    best = (i, j)
    return s[best[0]:best[1] + 1]
`,
    },
  },
  {
    id: 'trapping-rain',
    title: 'Trapping rain water (two pointers)',
    category: 'Hard arrays',
    blurb: 'Water above a bar = min(tallest on the left, tallest on the right) minus its height.',
    expects: ['array'],
    python: {
      args: { height: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1] },
      code: `def trap(height):
    left, right = 0, len(height) - 1
    left_max = right_max = 0
    water = 0
    while left < right:
        if height[left] < height[right]:
            left_max = max(left_max, height[left])
            water += left_max - height[left]
            left += 1
        else:
            right_max = max(right_max, height[right])
            water += right_max - height[right]
            right -= 1
    return water
`,
    },
  },
  {
    id: 'lru-linked',
    title: 'LRU cache (hash map + doubly linked list)',
    category: 'Design',
    blurb: 'The classic O(1) design: a map to nodes, a list ordered by recency.',
    expects: ['linked', 'hash'],
    python: {
      code: `class Node:
    def __init__(self, key=0, val=0):
        self.key, self.val = key, val
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.map = {}
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head

    def _remove(self, node):
        node.prev.next, node.next.prev = node.next, node.prev

    def _add_front(self, node):
        node.next, node.prev = self.head.next, self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        if key not in self.map:
            return -1
        node = self.map[key]
        self._remove(node)
        self._add_front(node)
        return node.val

    def put(self, key, val):
        if key in self.map:
            self._remove(self.map[key])
        node = Node(key, val)
        self.map[key] = node
        self._add_front(node)
        if len(self.map) > self.capacity:
            lru = self.tail.prev
            self._remove(lru)
            del self.map[lru.key]


cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
cache.get(1)
cache.put(3, 3)
print(cache.get(2), cache.get(3))
`,
    },
  },
  {
    id: 'nary-tree',
    title: 'N-ary tree: depth and level order',
    category: 'Trees',
    blurb: 'Every node holds a list of children.',
    expects: ['tree'],
    python: {
      code: `from collections import deque


class Node:
    def __init__(self, val, children=None):
        self.val = val
        self.children = children or []


def level_order(root):
    levels = []
    queue = deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            for child in node.children:
                queue.append(child)
        levels.append(level)
    return levels


tree = Node(1, [Node(3, [Node(5), Node(6)]), Node(2), Node(4)])
print(level_order(tree))
`,
    },
  },
  {
    id: 'clone-graph',
    title: 'Clone a graph (nodes with neighbours)',
    category: 'Hard graphs',
    blurb: 'A map from each original node to its copy keeps cycles from looping.',
    expects: ['graph'],
    python: {
      code: `class Node:
    def __init__(self, val):
        self.val = val
        self.neighbors = []


def clone(node):
    copies = {}

    def dfs(n):
        if n in copies:
            return copies[n]
        copy = Node(n.val)
        copies[n] = copy
        for nb in n.neighbors:
            copy.neighbors.append(dfs(nb))
        return copy

    return dfs(node)


a, b, c, d = Node(1), Node(2), Node(3), Node(4)
a.neighbors = [b, d]
b.neighbors = [a, c]
c.neighbors = [b, d]
d.neighbors = [a, c]
print(clone(a).val)
`,
    },
  },
  {
    id: 'heap-sort',
    title: 'Heap sort',
    category: 'Sorting',
    blurb: 'Build a max-heap in place, then repeatedly move the largest to the end.',
    expects: ['bars'],
    python: {
      args: { arr: [4, 10, 3, 5, 1, 8, 7] },
      code: `def heap_sort(arr):
    n = len(arr)

    def sift_down(root, end):
        while True:
            child = 2 * root + 1
            if child >= end:
                return
            if child + 1 < end and arr[child] < arr[child + 1]:
                child += 1
            if arr[root] >= arr[child]:
                return
            arr[root], arr[child] = arr[child], arr[root]
            root = child

    for start in range(n // 2 - 1, -1, -1):
        sift_down(start, n)
    for end in range(n - 1, 0, -1):
        arr[0], arr[end] = arr[end], arr[0]
        sift_down(0, end)
    return arr
`,
    },
  },
  {
    id: 'avl-insert',
    title: 'AVL tree insertion with rotations',
    category: 'Trees',
    blurb: 'Insert, then rotate to keep the heights balanced.',
    expects: ['tree'],
    python: {
      code: `class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None
        self.height = 1


def height(n):
    return n.height if n else 0


def update(n):
    n.height = 1 + max(height(n.left), height(n.right))


def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    update(y)
    update(x)
    return x


def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    update(x)
    update(y)
    return y


def insert(node, val):
    if node is None:
        return Node(val)
    if val < node.val:
        node.left = insert(node.left, val)
    else:
        node.right = insert(node.right, val)
    update(node)
    balance = height(node.left) - height(node.right)
    if balance > 1 and val < node.left.val:
        return rotate_right(node)
    if balance < -1 and val > node.right.val:
        return rotate_left(node)
    if balance > 1 and val > node.left.val:
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if balance < -1 and val < node.right.val:
        node.right = rotate_right(node.right)
        return rotate_left(node)
    return node


root = None
for v in [10, 20, 30, 40, 50, 25]:
    root = insert(root, v)
print(root.val)
`,
    },
  },
];
