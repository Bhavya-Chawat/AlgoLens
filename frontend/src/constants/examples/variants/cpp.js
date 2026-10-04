// C++ versions of examples that exist in Python. Keyed by example id; merged in ../index.js.
// (Programs are stored in template literals: no ${...} or backticks inside them.)

export const CPP_VARIANTS = {
  'bfs-shortest-path': {
    args: { source: 0, target: 5 },
    code: `class Solution {
public:
    vector<int> shortestPath(int source, int target) {
        vector<vector<int>> graph = {{1, 2}, {3}, {3, 4}, {5}, {5}, {}};
        int n = graph.size();
        vector<int> dist(n, -1), parent(n, -1);
        vector<bool> visited(n, false);
        queue<int> q;
        q.push(source);
        visited[source] = true;
        dist[source] = 0;
        while (!q.empty()) {
            int node = q.front();
            q.pop();
            if (node == target) break;
            for (int next : graph[node]) {
                if (!visited[next]) {
                    visited[next] = true;
                    dist[next] = dist[node] + 1;
                    parent[next] = node;
                    q.push(next);
                }
            }
        }
        vector<int> path;
        for (int v = target; v != -1; v = parent[v]) path.push_back(v);
        reverse(path.begin(), path.end());
        return path;
    }
};
`,
  },
  dijkstra: {
    args: { source: 0 },
    code: `class Solution {
public:
    vector<int> dijkstra(int source) {
        vector<vector<pair<int, int>>> graph = {
            {{1, 4}, {2, 1}}, {{4, 4}}, {{1, 2}, {3, 5}}, {{4, 1}}, {}
        };
        int n = graph.size();
        vector<int> dist(n, 1000000000);
        dist[source] = 0;
        priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> heap;
        heap.push({0, source});
        while (!heap.empty()) {
            pair<int, int> top = heap.top();
            heap.pop();
            int d = top.first;
            int node = top.second;
            if (d > dist[node]) continue;
            for (pair<int, int> edge : graph[node]) {
                int next = edge.first;
                int weight = edge.second;
                if (d + weight < dist[next]) {
                    dist[next] = d + weight;
                    heap.push({dist[next], next});
                }
            }
        }
        return dist;
    }
};
`,
  },
  'inorder-iterative': {
    args: { root: [4, 2, 6, 1, 3, 5, 7] },
    code: `class Solution {
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> result;
        stack<TreeNode*> st;
        TreeNode* node = root;
        while (node != nullptr || !st.empty()) {
            while (node != nullptr) {
                st.push(node);
                node = node->left;
            }
            node = st.top();
            st.pop();
            result.push_back(node->val);
            node = node->right;
        }
        return result;
    }
};
`,
  },
  'level-order': {
    args: { root: [3, 9, 20, null, null, 15, 7] },
    code: `class Solution {
public:
    vector<vector<int>> levelOrder(TreeNode* root) {
        vector<vector<int>> levels;
        if (root == nullptr) return levels;
        queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {
            vector<int> level;
            int size = q.size();
            for (int i = 0; i < size; i++) {
                TreeNode* node = q.front();
                q.pop();
                level.push_back(node->val);
                if (node->left) q.push(node->left);
                if (node->right) q.push(node->right);
            }
            levels.push_back(level);
        }
        return levels;
    }
};
`,
  },
  trie: {
    code: `struct TrieNode {
    TrieNode* children[26];
    bool end;
    TrieNode() : end(false) {
        for (int i = 0; i < 26; i++) children[i] = nullptr;
    }
};

void insert(TrieNode* root, const string& word) {
    TrieNode* node = root;
    for (char ch : word) {
        int i = ch - 'a';
        if (node->children[i] == nullptr) {
            node->children[i] = new TrieNode();
        }
        node = node->children[i];
    }
    node->end = true;
}

int main() {
    TrieNode* root = new TrieNode();
    vector<string> words = {"car", "cat", "dog", "do"};
    for (const string& word : words) {
        insert(root, word);
    }
    cout << "done" << endl;
    return 0;
}
`,
  },
  'n-queens': {
    args: { n: 4 },
    code: `class Solution {
public:
    vector<string> board;
    set<int> cols, diag1, diag2;
    vector<vector<string>> solutions;

    void place(int row, int n) {
        if (row == n) {
            solutions.push_back(board);
            return;
        }
        for (int col = 0; col < n; col++) {
            if (cols.count(col) || diag1.count(row - col) || diag2.count(row + col)) continue;
            board[row][col] = 'Q';
            cols.insert(col);
            diag1.insert(row - col);
            diag2.insert(row + col);
            place(row + 1, n);
            board[row][col] = '.';
            cols.erase(col);
            diag1.erase(row - col);
            diag2.erase(row + col);
        }
    }

    vector<vector<string>> solveNQueens(int n) {
        board.assign(n, string(n, '.'));
        place(0, n);
        return solutions;
    }
};
`,
  },
  'topological-sort': {
    args: { n: 6, edges: [[5, 2], [5, 0], [4, 0], [4, 1], [2, 3], [3, 1]] },
    code: `class Solution {
public:
    vector<int> topologicalOrder(int n, vector<vector<int>>& edges) {
        vector<vector<int>> graph(n);
        vector<int> indegree(n, 0);
        for (auto& e : edges) {
            graph[e[0]].push_back(e[1]);
            indegree[e[1]]++;
        }
        queue<int> q;
        for (int i = 0; i < n; i++) {
            if (indegree[i] == 0) q.push(i);
        }
        vector<int> order;
        while (!q.empty()) {
            int node = q.front();
            q.pop();
            order.push_back(node);
            for (int next : graph[node]) {
                indegree[next]--;
                if (indegree[next] == 0) q.push(next);
            }
        }
        return order;
    }
};
`,
  },
  'monotonic-stack': {
    args: { nums: [2, 1, 2, 4, 3] },
    code: `class Solution {
public:
    vector<int> nextGreater(vector<int>& nums) {
        vector<int> result(nums.size(), -1);
        stack<int> st;
        for (int i = 0; i < nums.size(); i++) {
            while (!st.empty() && nums[st.top()] < nums[i]) {
                result[st.top()] = nums[i];
                st.pop();
            }
            st.push(i);
        }
        return result;
    }
};
`,
  },
  kruskal: {
    args: { n: 5, edges: [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [3, 4, 6]] },
    code: `class Solution {
public:
    vector<int> parent;

    int find(int x) {
        while (parent[x] != x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }

    int kruskal(int n, vector<vector<int>>& edges) {
        parent.resize(n);
        for (int i = 0; i < n; i++) parent[i] = i;
        sort(edges.begin(), edges.end(), [](const vector<int>& a, const vector<int>& b) { return a[2] < b[2]; });
        int total = 0;
        for (auto& e : edges) {
            int ru = find(e[0]), rv = find(e[1]);
            if (ru != rv) {
                parent[ru] = rv;
                total += e[2];
            }
        }
        return total;
    }
};
`,
  },
  'edit-distance': {
    args: { word1: 'kitten', word2: 'sitting' },
    code: `class Solution {
public:
    int minDistance(string word1, string word2) {
        int m = word1.size(), n = word2.size();
        vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1[i - 1] == word2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + min(dp[i - 1][j], min(dp[i][j - 1], dp[i - 1][j - 1]));
                }
            }
        }
        return dp[m][n];
    }
};
`,
  },
  'permutations': {
    args: { nums: [1, 2, 3] },
    code: `class Solution {
public:
    vector<vector<int>> result;
    vector<int> path;
    vector<bool> used;

    void backtrack(vector<int>& nums) {
        if (path.size() == nums.size()) {
            result.push_back(path);
            return;
        }
        for (int i = 0; i < nums.size(); i++) {
            if (used[i]) continue;
            used[i] = true;
            path.push_back(nums[i]);
            backtrack(nums);
            path.pop_back();
            used[i] = false;
        }
    }

    vector<vector<int>> permute(vector<int>& nums) {
        used.assign(nums.size(), false);
        backtrack(nums);
        return result;
    }
};
`,
  },
};
