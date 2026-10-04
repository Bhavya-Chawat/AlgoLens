// Examples: graphs, grids, union-find, shortest paths, spanning trees.

export const GRAPH_EXAMPLES = [
  {
    id: 'bfs-shortest-path',
    title: 'BFS: shortest path in an unweighted graph',
    category: 'Graphs',
    blurb: 'Explore level by level with a queue; dist[] is the answer.',
    expects: ['graph', 'queue'],
    python: {
      args: { source: 0, target: 5 },
      code: `from collections import deque


def shortest_path(source, target):
    graph = {0: [1, 2], 1: [3], 2: [3, 4], 3: [5], 4: [5], 5: []}
    dist = {source: 0}
    parent = {source: None}
    visited = {source}
    queue = deque([source])
    while queue:
        node = queue.popleft()
        if node == target:
            break
        for neighbour in graph[node]:
            if neighbour not in visited:
                visited.add(neighbour)
                dist[neighbour] = dist[node] + 1
                parent[neighbour] = node
                queue.append(neighbour)
    path = []
    while target is not None:
        path.append(target)
        target = parent[target]
    return path[::-1]
`,
    },
    javascript: {
      args: { source: 0, target: 5 },
      code: `function shortestPath(source, target) {
  const graph = { 0: [1, 2], 1: [3], 2: [3, 4], 3: [5], 4: [5], 5: [] };
  const dist = { [source]: 0 };
  const visited = new Set([source]);
  const queue = [source];
  while (queue.length) {
    const node = queue.shift();
    if (node === target) break;
    for (const next of graph[node]) {
      if (!visited.has(next)) {
        visited.add(next);
        dist[next] = dist[node] + 1;
        queue.push(next);
      }
    }
  }
  return dist[target];
}
`,
    },
  },
  {
    id: 'dfs-recursive',
    title: 'DFS: depth-first traversal',
    category: 'Graphs',
    blurb: 'Go as deep as possible, then backtrack.',
    expects: ['graph', 'calltree'],
    python: {
      args: { start: 'A' },
      code: `def dfs_order(start):
    graph = {'A': ['B', 'C'], 'B': ['D', 'E'], 'C': ['F'], 'D': [], 'E': ['F'], 'F': []}
    visited = set()
    order = []

    def visit(node):
        visited.add(node)
        order.append(node)
        for neighbour in graph[node]:
            if neighbour not in visited:
                visit(neighbour)

    visit(start)
    return order
`,
    },
  },
  {
    id: 'dijkstra',
    title: "Dijkstra's shortest paths",
    category: 'Graphs',
    blurb: 'A min-heap always yields the closest unsettled vertex.',
    expects: ['graph', 'heap'],
    python: {
      args: { source: 'A' },
      code: `import heapq


def dijkstra(source):
    graph = {
        'A': [('B', 4), ('C', 1)],
        'B': [('E', 4)],
        'C': [('B', 2), ('D', 5)],
        'D': [('E', 1)],
        'E': [],
    }
    dist = {node: float('inf') for node in graph}
    dist[source] = 0
    heap = [(0, source)]
    while heap:
        d, node = heapq.heappop(heap)
        if d > dist[node]:
            continue
        for neighbour, weight in graph[node]:
            candidate = d + weight
            if candidate < dist[neighbour]:
                dist[neighbour] = candidate
                heapq.heappush(heap, (candidate, neighbour))
    return dist
`,
    },
  },
  {
    id: 'topological-sort',
    title: "Topological sort (Kahn's algorithm)",
    category: 'Graphs',
    blurb: 'Repeatedly take a vertex with no unmet prerequisites.',
    expects: ['graph', 'queue'],
    python: {
      args: { n: 6, edges: [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]] },
      code: `from collections import deque


def topological_order(n, edges):
    graph = {i: [] for i in range(n)}
    indegree = [0] * n
    for u, v in edges:
        graph[u].append(v)
        indegree[v] += 1
    queue = deque(i for i in range(n) if indegree[i] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in graph[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return order
`,
    },
  },
  {
    id: 'union-find',
    title: 'Union-Find (disjoint set union)',
    category: 'Union-Find',
    blurb: 'Union by rank and path compression keep the forest almost flat.',
    expects: ['dsu'],
    python: {
      args: { n: 8, pairs: [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [3, 7]] },
      code: `def count_components(n, pairs):
    parent = list(range(n))
    rank = [0] * n

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return False
        if rank[ra] < rank[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        if rank[ra] == rank[rb]:
            rank[ra] += 1
        return True

    components = n
    for a, b in pairs:
        if union(a, b):
            components -= 1
    return components
`,
    },
    cpp: {
      args: { n: 8, pairs: [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [3, 7]] },
      code: `class Solution {
public:
    vector<int> parent, rnk;

    int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]);
        }
        return parent[x];
    }

    bool unite(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (rnk[ra] < rnk[rb]) swap(ra, rb);
        parent[rb] = ra;
        if (rnk[ra] == rnk[rb]) rnk[ra]++;
        return true;
    }

    int countComponents(int n, vector<vector<int>>& pairs) {
        parent.resize(n);
        rnk.assign(n, 0);
        for (int i = 0; i < n; i++) parent[i] = i;
        int components = n;
        for (auto& p : pairs) {
            if (unite(p[0], p[1])) components--;
        }
        return components;
    }
};
`,
    },
    java: {
      args: { n: 8, pairs: [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [3, 7]] },
      code: `class Solution {
    int[] parent, rank;

    int find(int x) {
        if (parent[x] != x) {
            parent[x] = find(parent[x]);
        }
        return parent[x];
    }

    boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        if (rank[ra] < rank[rb]) { int t = ra; ra = rb; rb = t; }
        parent[rb] = ra;
        if (rank[ra] == rank[rb]) rank[ra]++;
        return true;
    }

    public int countComponents(int n, int[][] pairs) {
        parent = new int[n];
        rank = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int components = n;
        for (int[] p : pairs) {
            if (union(p[0], p[1])) components--;
        }
        return components;
    }
}
`,
    },
    javascript: {
      args: { n: 8, pairs: [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [3, 7]] },
      code: `function countComponents(n, pairs) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a, b) {
    let ra = find(a), rb = find(b);
    if (ra === rb) return false;
    if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]++;
    return true;
  }

  let components = n;
  for (const [a, b] of pairs) {
    if (union(a, b)) components--;
  }
  return components;
}
`,
    },
  },
  {
    id: 'union-find-class',
    title: 'Union-Find with sizes (class)',
    category: 'Union-Find',
    blurb: 'The same structure written as a class, with component sizes.',
    expects: ['dsu'],
    python: {
      code: `class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        return True


dsu = DSU(7)
for a, b in [(0, 1), (1, 2), (3, 4), (5, 6), (4, 6), (2, 6)]:
    dsu.union(a, b)
print(dsu.find(0) == dsu.find(3))
`,
    },
  },
  {
    id: 'kruskal',
    title: "Kruskal's minimum spanning tree",
    category: 'Union-Find',
    blurb: 'Take the cheapest edge that does not close a cycle.',
    expects: ['graph', 'dsu'],
    python: {
      args: { n: 5, edges: [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [3, 4, 6]] },
      code: `def kruskal(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    total = 0
    chosen = []
    for u, v, w in sorted(edges, key=lambda e: e[2]):
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            total += w
            chosen.append((u, v, w))
    return total
`,
    },
  },
  {
    id: 'number-of-islands',
    title: 'Number of islands (grid flood fill)',
    category: 'Grids',
    blurb: 'Flood every unvisited land cell; each flood is one island.',
    expects: ['grid'],
    python: {
      args: { grid: [['1', '1', '0', '0'], ['1', '0', '0', '1'], ['0', '0', '1', '1'], ['0', '0', '0', '0']] },
      code: `def num_islands(grid):
    rows, cols = len(grid), len(grid[0])
    seen = set()
    islands = 0

    def flood(r, c):
        if r < 0 or c < 0 or r >= rows or c >= cols:
            return
        if grid[r][c] != '1' or (r, c) in seen:
            return
        seen.add((r, c))
        flood(r + 1, c)
        flood(r - 1, c)
        flood(r, c + 1)
        flood(r, c - 1)

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1' and (r, c) not in seen:
                islands += 1
                flood(r, c)
    return islands
`,
    },
  },
  {
    id: 'grid-bfs-maze',
    title: 'Shortest path in a maze (grid BFS)',
    category: 'Grids',
    blurb: 'A queue of cells, a distance grid, four directions.',
    expects: ['grid', 'queue'],
    python: {
      args: { maze: [[0, 0, 1, 0], [1, 0, 1, 0], [0, 0, 0, 0], [0, 1, 1, 0]] },
      code: `from collections import deque


def shortest_path(maze):
    rows, cols = len(maze), len(maze[0])
    dist = [[-1] * cols for _ in range(rows)]
    dist[0][0] = 0
    queue = deque([(0, 0)])
    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and maze[nr][nc] == 0 and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                queue.append((nr, nc))
    return dist[rows - 1][cols - 1]
`,
    },
  },
  {
    id: 'bipartite',
    title: 'Is the graph bipartite? (2-colouring)',
    category: 'Graphs',
    blurb: 'Colour neighbours with the opposite colour; a clash means no.',
    expects: ['graph', 'queue'],
    python: {
      args: { graph: [[1, 3], [0, 2], [1, 3], [0, 2]] },
      code: `from collections import deque


def is_bipartite(graph):
    color = [-1] * len(graph)
    for start in range(len(graph)):
        if color[start] != -1:
            continue
        color[start] = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nxt in graph[node]:
                if color[nxt] == -1:
                    color[nxt] = 1 - color[node]
                    queue.append(nxt)
                elif color[nxt] == color[node]:
                    return False
    return True
`,
    },
  },
  {
    id: 'floyd-warshall',
    title: 'Floyd-Warshall all-pairs shortest paths',
    category: 'Graphs',
    blurb: 'Try every vertex k as an intermediate stop.',
    expects: ['dp'],
    python: {
      args: { n: 4 },
      code: `def floyd_warshall(n):
    INF = 99
    dist = [
        [0, 3, INF, 7],
        [8, 0, 2, INF],
        [5, INF, 0, 1],
        [2, INF, INF, 0],
    ]
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
    return dist
`,
    },
  },
  {
    id: 'bellman-ford',
    title: 'Bellman-Ford (negative weights)',
    category: 'Graphs',
    blurb: 'Relax every edge V-1 times.',
    expects: ['graph'],
    python: {
      args: { n: 5, edges: [[0, 1, 6], [0, 2, 7], [1, 2, 8], [1, 3, 5], [1, 4, -4], [2, 3, -3], [2, 4, 9], [3, 1, -2], [4, 3, 7]], source: 0 },
      code: `def bellman_ford(n, edges, source):
    dist = [float('inf')] * n
    dist[source] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    return dist
`,
    },
  },
  {
    id: 'cycle-detection',
    title: 'Cycle detection in a directed graph',
    category: 'Graphs',
    blurb: 'DFS with three colours: unvisited, on the stack, finished.',
    expects: ['graph', 'calltree'],
    python: {
      args: { graph: [[1], [2], [3], [1], []] },
      code: `def has_cycle(graph):
    WHITE, GRAY, BLACK = 0, 1, 2
    state = [WHITE] * len(graph)

    def dfs(node):
        state[node] = GRAY
        for nxt in graph[node]:
            if state[nxt] == GRAY:
                return True
            if state[nxt] == WHITE and dfs(nxt):
                return True
        state[node] = BLACK
        return False

    return any(state[n] == WHITE and dfs(n) for n in range(len(graph)))
`,
    },
  },
  {
    id: 'prim',
    title: "Prim's minimum spanning tree",
    category: 'Graphs',
    blurb: 'Grow one tree, always adding the cheapest edge out of it.',
    expects: ['graph', 'heap'],
    python: {
      args: { start: 0 },
      code: `import heapq


def prim(start):
    graph = {
        0: [(1, 2), (3, 6)],
        1: [(0, 2), (2, 3), (3, 8), (4, 5)],
        2: [(1, 3), (4, 7)],
        3: [(0, 6), (1, 8)],
        4: [(1, 5), (2, 7)],
    }
    in_tree = set()
    heap = [(0, start)]
    total = 0
    while heap:
        weight, node = heapq.heappop(heap)
        if node in in_tree:
            continue
        in_tree.add(node)
        total += weight
        for nxt, w in graph[node]:
            if nxt not in in_tree:
                heapq.heappush(heap, (w, nxt))
    return total
`,
    },
  },
];
