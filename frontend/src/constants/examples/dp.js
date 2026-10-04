// Examples: dynamic programming and backtracking.

export const DP_EXAMPLES = [
  {
    id: 'fibonacci-memo',
    title: 'Fibonacci with memoisation',
    category: 'Dynamic programming',
    blurb: 'The call tree shows exactly which sub-problems the cache saves.',
    expects: ['calltree', 'hash'],
    python: {
      args: { n: 7 },
      code: `def fib(n, memo=None):
    if memo is None:
        memo = {}
    if n in memo:
        return memo[n]
    if n < 2:
        return n
    memo[n] = fib(n - 1, memo) + fib(n - 2, memo)
    return memo[n]
`,
    },
    javascript: {
      args: { n: 7 },
      code: `function fib(n, memo = {}) {
  if (n in memo) return memo[n];
  if (n < 2) return n;
  memo[n] = fib(n - 1, memo) + fib(n - 2, memo);
  return memo[n];
}
`,
    },
  },
  {
    id: 'fibonacci-naive',
    title: 'Fibonacci without memoisation',
    category: 'Dynamic programming',
    blurb: 'The same sub-problems again and again: a tree of repeated work.',
    expects: ['calltree'],
    python: {
      args: { n: 5 },
      code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
`,
    },
  },
  {
    id: 'lcs',
    title: 'Longest common subsequence',
    category: 'Dynamic programming',
    blurb: 'dp[i][j] looks at its left, upper and diagonal neighbours.',
    expects: ['dp'],
    python: {
      args: { text1: 'ABCBDAB', text2: 'BDCABA' },
      code: `def lcs(text1, text2):
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i - 1] == text2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[m][n]
`,
    },
    cpp: {
      args: { text1: 'ABCBDAB', text2: 'BDCABA' },
      code: `class Solution {
public:
    int lcs(string text1, string text2) {
        int m = text1.size(), n = text2.size();
        vector<vector<int>> dp(m + 1, vector<int>(n + 1, 0));
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (text1[i - 1] == text2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n];
    }
};
`,
    },
    java: {
      args: { text1: 'ABCBDAB', text2: 'BDCABA' },
      code: `class Solution {
    public int lcs(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n];
    }
}
`,
    },
  },
  {
    id: 'edit-distance',
    title: 'Edit distance',
    category: 'Dynamic programming',
    blurb: 'Insert, delete or replace: the cheapest of three neighbours plus one.',
    expects: ['dp'],
    python: {
      args: { word1: 'kitten', word2: 'sitting' },
      code: `def min_distance(word1, word2):
    m, n = len(word1), len(word2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i - 1] == word2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]
`,
    },
  },
  {
    id: 'knapsack',
    title: '0/1 knapsack',
    category: 'Dynamic programming',
    blurb: 'Rows are items, columns are capacities.',
    expects: ['dp'],
    python: {
      args: { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], capacity: 7 },
      code: `def knapsack(weights, values, capacity):
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(capacity + 1):
            dp[i][w] = dp[i - 1][w]
            if weights[i - 1] <= w:
                dp[i][w] = max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1])
    return dp[n][capacity]
`,
    },
  },
  {
    id: 'coin-change',
    title: 'Coin change (minimum coins)',
    category: 'Dynamic programming',
    blurb: 'dp[a] = fewest coins that make amount a.',
    expects: ['dp'],
    python: {
      args: { coins: [1, 5, 6], amount: 11 },
      code: `def coin_change(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for a in range(1, amount + 1):
        for coin in coins:
            if coin <= a and dp[a - coin] + 1 < dp[a]:
                dp[a] = dp[a - coin] + 1
    return dp[amount] if dp[amount] != float('inf') else -1
`,
    },
    javascript: {
      args: { coins: [1, 5, 6], amount: 11 },
      code: `function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a && dp[a - coin] + 1 < dp[a]) {
        dp[a] = dp[a - coin] + 1;
      }
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}
`,
    },
  },
  {
    id: 'lis',
    title: 'Longest increasing subsequence',
    category: 'Dynamic programming',
    blurb: 'dp[i] = best subsequence ending at i.',
    expects: ['dp'],
    python: {
      args: { nums: [10, 9, 2, 5, 3, 7, 101, 18] },
      code: `def length_of_lis(nums):
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)
`,
    },
  },
  {
    id: 'unique-paths',
    title: 'Unique paths on a grid',
    category: 'Dynamic programming',
    blurb: 'Paths into a cell = paths from above + paths from the left.',
    expects: ['dp'],
    python: {
      args: { m: 4, n: 5 },
      code: `def unique_paths(m, n):
    dp = [[1] * n for _ in range(m)]
    for r in range(1, m):
        for c in range(1, n):
            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]
    return dp[m - 1][n - 1]
`,
    },
  },
  {
    id: 'house-robber',
    title: 'House robber',
    category: 'Dynamic programming',
    blurb: 'Rob this house or skip it: two running values are enough.',
    expects: ['array'],
    python: {
      args: { nums: [2, 7, 9, 3, 1] },
      code: `def rob(nums):
    take, skip = 0, 0
    for value in nums:
        take, skip = skip + value, max(take, skip)
    return max(take, skip)
`,
    },
  },
  {
    id: 'permutations',
    title: 'Permutations (backtracking)',
    category: 'Backtracking',
    blurb: 'Choose, explore, un-choose.',
    expects: ['calltree'],
    python: {
      args: { nums: [1, 2, 3] },
      code: `def permute(nums):
    result = []
    path = []
    used = [False] * len(nums)

    def backtrack():
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i in range(len(nums)):
            if used[i]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result
`,
    },
  },
  {
    id: 'subsets',
    title: 'Subsets (include or exclude)',
    category: 'Backtracking',
    blurb: 'Every element is either in or out.',
    expects: ['calltree'],
    python: {
      args: { nums: [1, 2, 3] },
      code: `def subsets(nums):
    result = []

    def go(i, current):
        if i == len(nums):
            result.append(current[:])
            return
        current.append(nums[i])
        go(i + 1, current)
        current.pop()
        go(i + 1, current)

    go(0, [])
    return result
`,
    },
  },
  {
    id: 'n-queens',
    title: 'N-Queens',
    category: 'Backtracking',
    blurb: 'Place one queen per row; undo when no column is safe.',
    expects: ['grid', 'calltree'],
    python: {
      args: { n: 4 },
      code: `def solve_n_queens(n):
    board = [['.'] * n for _ in range(n)]
    cols, diag1, diag2 = set(), set(), set()
    solutions = []

    def place(row):
        if row == n:
            solutions.append([''.join(r) for r in board])
            return
        for col in range(n):
            if col in cols or (row - col) in diag1 or (row + col) in diag2:
                continue
            board[row][col] = 'Q'
            cols.add(col)
            diag1.add(row - col)
            diag2.add(row + col)
            place(row + 1)
            board[row][col] = '.'
            cols.remove(col)
            diag1.remove(row - col)
            diag2.remove(row + col)

    place(0)
    return solutions
`,
    },
  },
  {
    id: 'generate-parentheses',
    title: 'Generate parentheses',
    category: 'Backtracking',
    blurb: 'Open while you can, close while it is valid.',
    expects: ['calltree'],
    python: {
      args: { n: 3 },
      code: `def generate(n):
    result = []

    def build(current, opened, closed):
        if len(current) == 2 * n:
            result.append(current)
            return
        if opened < n:
            build(current + '(', opened + 1, closed)
        if closed < opened:
            build(current + ')', opened, closed + 1)

    build('', 0, 0)
    return result
`,
    },
  },
  {
    id: 'sudoku-4x4',
    title: 'Sudoku (4x4 solver)',
    category: 'Backtracking',
    blurb: 'Try digits cell by cell; back out of dead ends.',
    expects: ['grid'],
    python: {
      args: { board: [[1, 0, 0, 0], [0, 0, 3, 0], [0, 4, 0, 0], [0, 0, 0, 2]] },
      code: `def solve(board):
    n = 4

    def ok(r, c, d):
        for i in range(n):
            if board[r][i] == d or board[i][c] == d:
                return False
        br, bc = r // 2 * 2, c // 2 * 2
        for i in range(2):
            for j in range(2):
                if board[br + i][bc + j] == d:
                    return False
        return True

    def fill():
        for r in range(n):
            for c in range(n):
                if board[r][c] == 0:
                    for d in range(1, n + 1):
                        if ok(r, c, d):
                            board[r][c] = d
                            if fill():
                                return True
                            board[r][c] = 0
                    return False
        return True

    fill()
    return board
`,
    },
  },
];
