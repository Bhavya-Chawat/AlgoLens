// Examples: arrays, strings, sorting, searching, stacks. Every example lists what the visualiser is expected
// to recognise (`expects`) - src/viz/examples.test.js runs them all through the real tracers and checks it.

export const ARRAY_EXAMPLES = [
  {
    id: 'bubble-sort',
    title: 'Bubble sort',
    category: 'Sorting',
    blurb: 'Adjacent swaps, the largest value bubbles to the end of each pass.',
    expects: ['bars'],
    python: {
      args: { arr: [5, 2, 9, 1, 7, 3] },
      code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
`,
    },
    javascript: {
      args: { arr: [5, 2, 9, 1, 7, 3] },
      code: `function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        const tmp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = tmp;
      }
    }
  }
  return arr;
}
`,
    },
    cpp: {
      args: { arr: [5, 2, 9, 1, 7, 3] },
      code: `class Solution {
public:
    vector<int> bubbleSort(vector<int>& arr) {
        int n = arr.size();
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    swap(arr[j], arr[j + 1]);
                }
            }
        }
        return arr;
    }
};
`,
    },
    java: {
      args: { arr: [5, 2, 9, 1, 7, 3] },
      code: `class Solution {
    public int[] bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int tmp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = tmp;
                }
            }
        }
        return arr;
    }
}
`,
    },
  },
  {
    id: 'quick-sort',
    title: 'Quick sort (Lomuto partition)',
    category: 'Sorting',
    blurb: 'Partition around a pivot, then sort each side recursively.',
    expects: ['bars', 'calltree'],
    python: {
      args: { arr: [7, 2, 9, 4, 1, 8, 3] },
      code: `def quick_sort(arr):
    def sort(lo, hi):
        if lo >= hi:
            return
        pivot = arr[hi]
        i = lo
        for j in range(lo, hi):
            if arr[j] < pivot:
                arr[i], arr[j] = arr[j], arr[i]
                i += 1
        arr[i], arr[hi] = arr[hi], arr[i]
        sort(lo, i - 1)
        sort(i + 1, hi)
    sort(0, len(arr) - 1)
    return arr
`,
    },
  },
  {
    id: 'merge-sort',
    title: 'Merge sort',
    category: 'Sorting',
    blurb: 'Split in half, sort each half, merge the two sorted halves.',
    expects: ['calltree', 'array'],
    python: {
      args: { nums: [6, 3, 8, 1, 9, 2] },
      code: `def merge_sort(nums):
    if len(nums) <= 1:
        return nums
    mid = len(nums) // 2
    left = merge_sort(nums[:mid])
    right = merge_sort(nums[mid:])
    merged = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged
`,
    },
  },
  {
    id: 'insertion-selection',
    title: 'Insertion sort',
    category: 'Sorting',
    blurb: 'Grow a sorted prefix by inserting each next value into place.',
    expects: ['bars'],
    python: {
      args: { arr: [4, 3, 6, 1, 5, 2] },
      code: `def insertion_sort(arr):
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key
    return arr
`,
    },
  },
  {
    id: 'binary-search',
    title: 'Binary search',
    category: 'Searching',
    blurb: 'Halve the search range each step: watch lo, mid and hi close in.',
    expects: ['array'],
    python: {
      args: { nums: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], target: 13 },
      code: `def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
    },
    javascript: {
      args: { nums: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], target: 13 },
      code: `function search(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
`,
    },
    java: {
      args: { nums: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], target: 13 },
      code: `class Solution {
    public int search(int[] nums, int target) {
        int lo = 0, hi = nums.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
}
`,
    },
    cpp: {
      args: { nums: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19], target: 13 },
      code: `class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = nums.size() - 1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            if (nums[mid] == target) return mid;
            if (nums[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
};
`,
    },
  },
  {
    id: 'two-sum',
    title: 'Two Sum (hash map)',
    category: 'Hashing',
    blurb: 'Remember every value seen so far; the complement is a lookup away.',
    expects: ['array', 'hash'],
    python: {
      args: { nums: [2, 7, 11, 15], target: 9 },
      code: `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return []
`,
    },
    javascript: {
      args: { nums: [2, 7, 11, 15], target: 9 },
      code: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (seen.has(complement)) return [seen.get(complement), i];
    seen.set(nums[i], i);
  }
  return [];
}
`,
    },
  },
  {
    id: 'sliding-window',
    title: 'Longest substring without repeats',
    category: 'Sliding window',
    blurb: 'A window that grows on the right and shrinks on the left.',
    expects: ['string', 'hash'],
    python: {
      args: { s: 'abcabcbb' },
      code: `def length_of_longest_substring(s):
    last = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best
`,
    },
  },
  {
    id: 'two-pointers',
    title: 'Container with most water',
    category: 'Two pointers',
    blurb: 'Two pointers walk inwards; always move the shorter wall.',
    expects: ['array'],
    python: {
      args: { height: [1, 8, 6, 2, 5, 4, 8, 3, 7] },
      code: `def max_area(height):
    left, right = 0, len(height) - 1
    best = 0
    while left < right:
        area = min(height[left], height[right]) * (right - left)
        best = max(best, area)
        if height[left] < height[right]:
            left += 1
        else:
            right -= 1
    return best
`,
    },
  },
  {
    id: 'kadane',
    title: "Kadane's maximum subarray",
    category: 'Dynamic programming',
    blurb: 'Carry the best sum ending here; restart when it goes negative.',
    expects: ['array'],
    python: {
      args: { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] },
      code: `def max_sub_array(nums):
    current = best = nums[0]
    for i in range(1, len(nums)):
        current = max(nums[i], current + nums[i])
        best = max(best, current)
    return best
`,
    },
  },
  {
    id: 'prefix-sums',
    title: 'Prefix sums & range queries',
    category: 'Arrays',
    blurb: 'Build prefix sums once, answer every range sum in O(1).',
    expects: ['array'],
    python: {
      args: { nums: [3, 1, 4, 1, 5, 9, 2, 6], queries: [[0, 3], [2, 5], [4, 7]] },
      code: `def range_sums(nums, queries):
    prefix = [0] * (len(nums) + 1)
    for i, value in enumerate(nums):
        prefix[i + 1] = prefix[i] + value
    answers = []
    for lo, hi in queries:
        answers.append(prefix[hi + 1] - prefix[lo])
    return answers
`,
    },
  },
  {
    id: 'kmp',
    title: 'KMP string matching',
    category: 'Strings',
    blurb: 'Build the failure table, then never move back in the text.',
    expects: ['string', 'array'],
    python: {
      args: { text: 'abxabcabcaby', pattern: 'abcaby' },
      code: `def kmp_search(text, pattern):
    lps = [0] * len(pattern)
    length = 0
    i = 1
    while i < len(pattern):
        if pattern[i] == pattern[length]:
            length += 1
            lps[i] = length
            i += 1
        elif length:
            length = lps[length - 1]
        else:
            lps[i] = 0
            i += 1
    i = j = 0
    while i < len(text):
        if text[i] == pattern[j]:
            i += 1
            j += 1
            if j == len(pattern):
                return i - j
        elif j:
            j = lps[j - 1]
        else:
            i += 1
    return -1
`,
    },
  },
  {
    id: 'monotonic-stack',
    title: 'Next greater element (monotonic stack)',
    category: 'Stacks',
    blurb: 'A stack of indices that is always decreasing.',
    expects: ['array', 'stack'],
    python: {
      args: { nums: [2, 1, 2, 4, 3] },
      code: `def next_greater(nums):
    result = [-1] * len(nums)
    stack = []
    for i, value in enumerate(nums):
        while stack and nums[stack[-1]] < value:
            result[stack.pop()] = value
        stack.append(i)
    return result
`,
    },
  },
  {
    id: 'valid-parentheses',
    title: 'Valid parentheses',
    category: 'Stacks',
    blurb: 'Push every opener, pop and match on every closer.',
    expects: ['string', 'stack'],
    python: {
      args: { s: '({[]})[]' },
      code: `def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack
`,
    },
  },
  {
    id: 'merge-intervals',
    title: 'Merge intervals',
    category: 'Intervals',
    blurb: 'Sort by start, then extend or append.',
    expects: ['intervals'],
    python: {
      args: { intervals: [[1, 3], [8, 10], [2, 6], [15, 18], [17, 20]] },
      code: `def merge(intervals):
    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
`,
    },
  },
  {
    id: 'sieve',
    title: 'Sieve of Eratosthenes',
    category: 'Math',
    blurb: 'Cross out multiples of every prime.',
    expects: ['array'],
    python: {
      args: { n: 30 },
      code: `def sieve(n):
    is_prime = [True] * (n + 1)
    is_prime[0] = is_prime[1] = False
    p = 2
    while p * p <= n:
        if is_prime[p]:
            for multiple in range(p * p, n + 1, p):
                is_prime[multiple] = False
        p += 1
    return [i for i in range(n + 1) if is_prime[i]]
`,
    },
  },
  {
    id: 'rotate-matrix',
    title: 'Rotate matrix 90 degrees',
    category: 'Matrix',
    blurb: 'Transpose, then reverse every row - in place.',
    expects: ['grid'],
    python: {
      args: { matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
      code: `def rotate(matrix):
    n = len(matrix)
    for i in range(n):
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]
    for row in matrix:
        row.reverse()
    return matrix
`,
    },
  },
  {
    id: 'game-of-life',
    title: "Conway's Game of Life",
    category: 'Matrix',
    blurb: 'One generation on a small board.',
    expects: ['grid'],
    python: {
      args: { board: [[0, 1, 0, 0], [0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]] },
      code: `def game_of_life(board):
    rows, cols = len(board), len(board[0])
    nxt = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            alive = 0
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if (dr or dc) and 0 <= r + dr < rows and 0 <= c + dc < cols:
                        alive += board[r + dr][c + dc]
            if board[r][c] == 1 and alive in (2, 3):
                nxt[r][c] = 1
            elif board[r][c] == 0 and alive == 3:
                nxt[r][c] = 1
    return nxt
`,
    },
  },
];
