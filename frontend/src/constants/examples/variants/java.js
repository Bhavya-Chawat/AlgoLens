// Java versions of examples that exist in Python. Keyed by example id; merged in ../index.js.
// (Programs are stored in template literals: no ${...} or backticks inside them.)

export const JAVA_VARIANTS = {
  'bfs-shortest-path': {
    args: { source: 0, target: 5 },
    code: `class Solution {
    public int[] shortestPath(int source, int target) {
        int[][] graph = {{1, 2}, {3}, {3, 4}, {5}, {5}, {}};
        int n = graph.length;
        int[] dist = new int[n];
        int[] parent = new int[n];
        boolean[] visited = new boolean[n];
        java.util.Arrays.fill(dist, -1);
        java.util.Arrays.fill(parent, -1);
        java.util.Queue<Integer> queue = new java.util.ArrayDeque<>();
        queue.add(source);
        visited[source] = true;
        dist[source] = 0;
        while (!queue.isEmpty()) {
            int node = queue.poll();
            if (node == target) break;
            for (int next : graph[node]) {
                if (!visited[next]) {
                    visited[next] = true;
                    dist[next] = dist[node] + 1;
                    parent[next] = node;
                    queue.add(next);
                }
            }
        }
        java.util.List<Integer> path = new java.util.ArrayList<>();
        for (int v = target; v != -1; v = parent[v]) path.add(0, v);
        int[] out = new int[path.size()];
        for (int i = 0; i < out.length; i++) out[i] = path.get(i);
        return out;
    }
}
`,
  },
  dijkstra: {
    args: { source: 0 },
    code: `class Solution {
    public int[] dijkstra(int source) {
        int[][][] graph = {
            {{1, 4}, {2, 1}}, {{4, 4}}, {{1, 2}, {3, 5}}, {{4, 1}}, {}
        };
        int n = graph.length;
        int[] dist = new int[n];
        java.util.Arrays.fill(dist, 1000000000);
        dist[source] = 0;
        java.util.PriorityQueue<int[]> heap = new java.util.PriorityQueue<>((a, b) -> a[0] - b[0]);
        heap.add(new int[] {0, source});
        while (!heap.isEmpty()) {
            int[] top = heap.poll();
            int d = top[0];
            int node = top[1];
            if (d > dist[node]) continue;
            for (int[] edge : graph[node]) {
                int next = edge[0];
                int weight = edge[1];
                if (d + weight < dist[next]) {
                    dist[next] = d + weight;
                    heap.add(new int[] {dist[next], next});
                }
            }
        }
        return dist;
    }
}
`,
  },
  'inorder-iterative': {
    args: { root: [4, 2, 6, 1, 3, 5, 7] },
    code: `class Solution {
    public java.util.List<Integer> inorderTraversal(TreeNode root) {
        java.util.List<Integer> result = new java.util.ArrayList<>();
        java.util.Deque<TreeNode> stack = new java.util.ArrayDeque<>();
        TreeNode node = root;
        while (node != null || !stack.isEmpty()) {
            while (node != null) {
                stack.push(node);
                node = node.left;
            }
            node = stack.pop();
            result.add(node.val);
            node = node.right;
        }
        return result;
    }
}
`,
  },
  trie: {
    code: `import java.util.*;

public class Main {
    static class TrieNode {
        Map<Character, TrieNode> children = new HashMap<>();
        boolean end = false;
    }

    static void insert(TrieNode root, String word) {
        TrieNode node = root;
        for (char ch : word.toCharArray()) {
            if (!node.children.containsKey(ch)) {
                node.children.put(ch, new TrieNode());
            }
            node = node.children.get(ch);
        }
        node.end = true;
    }

    public static void main(String[] args) {
        TrieNode root = new TrieNode();
        for (String word : new String[] {"car", "cat", "dog", "do"}) {
            insert(root, word);
        }
        System.out.println("done");
    }
}
`,
  },
  'topological-sort': {
    args: { n: 6, edges: [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]] },
    code: `class Solution {
    public int[] topologicalOrder(int n, int[][] edges) {
        java.util.List<java.util.List<Integer>> graph = new java.util.ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new java.util.ArrayList<>());
        int[] indegree = new int[n];
        for (int[] e : edges) {
            graph.get(e[0]).add(e[1]);
            indegree[e[1]]++;
        }
        java.util.Queue<Integer> queue = new java.util.ArrayDeque<>();
        for (int i = 0; i < n; i++) {
            if (indegree[i] == 0) queue.add(i);
        }
        int[] order = new int[n];
        int count = 0;
        while (!queue.isEmpty()) {
            int node = queue.poll();
            order[count++] = node;
            for (int next : graph.get(node)) {
                indegree[next]--;
                if (indegree[next] == 0) queue.add(next);
            }
        }
        return order;
    }
}
`,
  },
  'monotonic-stack': {
    args: { nums: [2, 1, 2, 4, 3] },
    code: `class Solution {
    public int[] nextGreater(int[] nums) {
        int[] result = new int[nums.length];
        java.util.Arrays.fill(result, -1);
        java.util.Deque<Integer> stack = new java.util.ArrayDeque<>();
        for (int i = 0; i < nums.length; i++) {
            while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
                result[stack.pop()] = nums[i];
            }
            stack.push(i);
        }
        return result;
    }
}
`,
  },
  kruskal: {
    args: { n: 5, edges: [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [3, 4, 6]] },
    code: `class Solution {
    int[] parent;

    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    public int kruskal(int n, int[][] edges) {
        parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        java.util.Arrays.sort(edges, (a, b) -> a[2] - b[2]);
        int total = 0;
        for (int[] e : edges) {
            int ru = find(e[0]), rv = find(e[1]);
            if (ru != rv) {
                parent[ru] = rv;
                total += e[2];
            }
        }
        return total;
    }
}
`,
  },
  'edit-distance': {
    args: { word1: 'kitten', word2: 'sitting' },
    code: `class Solution {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], Math.min(dp[i][j - 1], dp[i - 1][j - 1]));
                }
            }
        }
        return dp[m][n];
    }
}
`,
  },
  permutations: {
    args: { nums: [1, 2, 3] },
    code: `class Solution {
    java.util.List<java.util.List<Integer>> result = new java.util.ArrayList<>();
    java.util.List<Integer> path = new java.util.ArrayList<>();
    boolean[] used;

    void backtrack(int[] nums) {
        if (path.size() == nums.length) {
            result.add(new java.util.ArrayList<>(path));
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true;
            path.add(nums[i]);
            backtrack(nums);
            path.remove(path.size() - 1);
            used[i] = false;
        }
    }

    public java.util.List<java.util.List<Integer>> permute(int[] nums) {
        used = new boolean[nums.length];
        backtrack(nums);
        return result;
    }
}
`,
  },
};
