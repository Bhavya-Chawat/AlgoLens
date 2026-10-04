// Examples: linked lists, trees, tries, heaps, caches, segment trees, bit tricks.

export const STRUCTURE_EXAMPLES = [
  {
    id: 'reverse-linked-list',
    title: 'Reverse a linked list',
    category: 'Linked lists',
    blurb: 'Three pointers rewire next, one node at a time.',
    expects: ['linked'],
    python: {
      args: { head: [1, 2, 3, 4, 5] },
      code: `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
`,
    },
    cpp: {
      args: { head: [1, 2, 3, 4, 5] },
      code: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* curr = head;
        while (curr != nullptr) {
            ListNode* nxt = curr->next;
            curr->next = prev;
            prev = curr;
            curr = nxt;
        }
        return prev;
    }
};
`,
    },
  },
  {
    id: 'merge-sorted-lists',
    title: 'Merge two sorted lists',
    category: 'Linked lists',
    blurb: 'A dummy head and a tail pointer stitch the smaller node each time.',
    expects: ['linked'],
    python: {
      args: { l1: [1, 3, 5], l2: [2, 4, 6] },
      code: `class Solution:
    def mergeTwoLists(self, l1: Optional[ListNode], l2: Optional[ListNode]) -> Optional[ListNode]:
        dummy = ListNode(0)
        tail = dummy
        while l1 and l2:
            if l1.val <= l2.val:
                tail.next = l1
                l1 = l1.next
            else:
                tail.next = l2
                l2 = l2.next
            tail = tail.next
        tail.next = l1 or l2
        return dummy.next
`,
    },
  },
  {
    id: 'linked-list-cycle',
    title: "Cycle detection (Floyd's tortoise and hare)",
    category: 'Linked lists',
    blurb: 'Slow moves one step, fast moves two; they meet only inside a cycle.',
    expects: ['linked'],
    python: {
      code: `class Node:
    def __init__(self, val):
        self.val = val
        self.next = None


def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False


nodes = [Node(i) for i in range(1, 6)]
for a, b in zip(nodes, nodes[1:]):
    a.next = b
nodes[-1].next = nodes[2]
print(has_cycle(nodes[0]))
`,
    },
  },
  {
    id: 'inorder-iterative',
    title: 'Inorder traversal (iterative)',
    category: 'Trees',
    blurb: 'An explicit stack replaces the recursion.',
    expects: ['tree', 'stack'],
    python: {
      args: { root: [4, 2, 6, 1, 3, 5, 7] },
      code: `class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        result = []
        stack = []
        node = root
        while node or stack:
            while node:
                stack.append(node)
                node = node.left
            node = stack.pop()
            result.append(node.val)
            node = node.right
        return result
`,
    },
  },
  {
    id: 'level-order',
    title: 'Level-order traversal (BFS)',
    category: 'Trees',
    blurb: 'A queue holds the current level.',
    expects: ['tree', 'queue'],
    python: {
      args: { root: [3, 9, 20, null, null, 15, 7] },
      code: `from collections import deque


class Solution:
    def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        if not root:
            return []
        levels = []
        queue = deque([root])
        while queue:
            level = []
            for _ in range(len(queue)):
                node = queue.popleft()
                level.append(node.val)
                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)
            levels.append(level)
        return levels
`,
    },
  },
  {
    id: 'validate-bst',
    title: 'Validate a binary search tree',
    category: 'Trees',
    blurb: 'Pass the allowed (lo, hi) range down the recursion.',
    expects: ['tree', 'calltree'],
    python: {
      args: { root: [5, 3, 8, 1, 4, 7, 9] },
      code: `class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        def check(node, lo, hi):
            if node is None:
                return True
            if not (lo < node.val < hi):
                return False
            return check(node.left, lo, node.val) and check(node.right, node.val, hi)
        return check(root, float('-inf'), float('inf'))
`,
    },
  },
  {
    id: 'lowest-common-ancestor',
    title: 'Lowest common ancestor',
    category: 'Trees',
    blurb: 'Return the node where the two searches meet.',
    expects: ['tree', 'calltree'],
    python: {
      code: `class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


def lca(root, p, q):
    if root is None or root.val == p or root.val == q:
        return root
    left = lca(root.left, p, q)
    right = lca(root.right, p, q)
    if left and right:
        return root
    return left or right


tree = TreeNode(6,
                TreeNode(2, TreeNode(0), TreeNode(4, TreeNode(3), TreeNode(5))),
                TreeNode(8, TreeNode(7), TreeNode(9)))
print(lca(tree, 3, 5).val)
`,
    },
  },
  {
    id: 'bst-insert',
    title: 'Build a binary search tree',
    category: 'Trees',
    blurb: 'Insert values one at a time; watch the tree grow.',
    expects: ['tree'],
    python: {
      code: `class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None


def insert(root, val):
    if root is None:
        return Node(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root


root = None
for value in [50, 30, 70, 20, 40, 60, 80]:
    root = insert(root, value)
print(root.val)
`,
    },
  },
  {
    id: 'trie',
    title: 'Trie (prefix tree)',
    category: 'Tries',
    blurb: 'One edge per letter; shared prefixes share nodes.',
    expects: ['trie'],
    python: {
      code: `class TrieNode:
    def __init__(self):
        self.children = {}
        self.end = False


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word):
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.end = True

    def starts_with(self, prefix):
        node = self.root
        for ch in prefix:
            if ch not in node.children:
                return False
            node = node.children[ch]
        return True


trie = Trie()
for word in ["car", "cat", "dog", "do"]:
    trie.insert(word)
print(trie.starts_with("ca"), trie.starts_with("dx"))
`,
    },
  },
  {
    id: 'trie-dict',
    title: 'Trie built from nested dicts',
    category: 'Tries',
    blurb: 'The same idea with plain dictionaries.',
    expects: ['trie'],
    python: {
      args: { words: ['tea', 'ten', 'to', 'inn'] },
      code: `def build_trie(words):
    root = {}
    for word in words:
        node = root
        for ch in word:
            node = node.setdefault(ch, {})
        node['$'] = True
    return root
`,
    },
  },
  {
    id: 'heap-sift',
    title: 'Min-heap: push, pop and sift',
    category: 'Heaps',
    blurb: 'An array that is secretly a tree: parent of i is (i-1)//2.',
    expects: ['heap'],
    python: {
      code: `def push(heap, value):
    heap.append(value)
    i = len(heap) - 1
    while i > 0:
        parent = (i - 1) // 2
        if heap[parent] <= heap[i]:
            break
        heap[parent], heap[i] = heap[i], heap[parent]
        i = parent


def pop(heap):
    top = heap[0]
    last = heap.pop()
    if heap:
        heap[0] = last
        i = 0
        while True:
            left, right, smallest = 2 * i + 1, 2 * i + 2, i
            if left < len(heap) and heap[left] < heap[smallest]:
                smallest = left
            if right < len(heap) and heap[right] < heap[smallest]:
                smallest = right
            if smallest == i:
                break
            heap[i], heap[smallest] = heap[smallest], heap[i]
            i = smallest
    return top


heap = []
for value in [9, 4, 7, 1, 8, 2]:
    push(heap, value)
print(pop(heap), pop(heap))
`,
    },
  },
  {
    id: 'heapq-top-k',
    title: 'Top-K frequent elements (heapq)',
    category: 'Heaps',
    blurb: 'Count with a dict, keep the k best in a small heap.',
    expects: ['hash', 'heap'],
    python: {
      args: { nums: [1, 1, 1, 2, 2, 3, 3, 3, 3, 4], k: 2 },
      code: `import heapq


def top_k_frequent(nums, k):
    count = {}
    for n in nums:
        count[n] = count.get(n, 0) + 1
    heap = []
    for value, freq in count.items():
        heapq.heappush(heap, (freq, value))
        if len(heap) > k:
            heapq.heappop(heap)
    return [value for freq, value in heap]
`,
    },
  },
  {
    id: 'lru-cache',
    title: 'LRU cache (OrderedDict)',
    category: 'Design',
    blurb: 'Most recently used moves to the end; evict from the front.',
    expects: ['hash'],
    python: {
      code: `from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)


cache = LRUCache(2)
cache.put(1, 10)
cache.put(2, 20)
cache.get(1)
cache.put(3, 30)
print(cache.get(2), cache.get(3))
`,
    },
  },
  {
    id: 'segment-tree',
    title: 'Segment tree: range sum with updates',
    category: 'Advanced',
    blurb: 'Each node stores the sum of a range; queries touch O(log n) nodes.',
    expects: ['segtree'],
    python: {
      code: `def build(nums):
    n = len(nums)
    tree = [0] * (2 * n)
    for i in range(n):
        tree[n + i] = nums[i]
    for i in range(n - 1, 0, -1):
        tree[i] = tree[2 * i] + tree[2 * i + 1]
    return tree


def update(tree, n, pos, value):
    i = pos + n
    tree[i] = value
    while i > 1:
        i //= 2
        tree[i] = tree[2 * i] + tree[2 * i + 1]


def query(tree, n, lo, hi):
    total = 0
    lo += n
    hi += n + 1
    while lo < hi:
        if lo & 1:
            total += tree[lo]
            lo += 1
        if hi & 1:
            hi -= 1
            total += tree[hi]
        lo //= 2
        hi //= 2
    return total


nums = [2, 1, 5, 3, 4, 6, 7, 8]
tree = build(nums)
update(tree, len(nums), 2, 9)
print(query(tree, len(nums), 1, 5))
`,
    },
  },
  {
    id: 'fenwick-tree',
    title: 'Fenwick tree (binary indexed tree)',
    category: 'Advanced',
    blurb: 'Prefix sums with index tricks: i & -i hops between responsibilities.',
    expects: ['fenwick'],
    python: {
      code: `def update(bit, i, delta):
    while i < len(bit):
        bit[i] += delta
        i += i & -i


def prefix_sum(bit, i):
    total = 0
    while i > 0:
        total += bit[i]
        i -= i & -i
    return total


values = [3, 2, -1, 6, 5, 4, -3, 3]
bit = [0] * (len(values) + 1)
for index, value in enumerate(values):
    update(bit, index + 1, value)
print(prefix_sum(bit, 6))
`,
    },
  },
  {
    id: 'bit-manipulation',
    title: 'Bit tricks: subsets with a bitmask',
    category: 'Bit manipulation',
    blurb: 'Every integer from 0 to 2^n - 1 is one subset.',
    expects: ['bits'],
    python: {
      args: { items: ['a', 'b', 'c'] },
      code: `def subsets(items):
    n = len(items)
    result = []
    for mask in range(1 << n):
        subset = []
        for bit in range(n):
            if mask & (1 << bit):
                subset.append(items[bit])
        result.append(subset)
    return result
`,
    },
  },
  {
    id: 'count-bits',
    title: "Count set bits (Brian Kernighan)",
    category: 'Bit manipulation',
    blurb: 'n & (n - 1) clears the lowest set bit.',
    expects: ['bits'],
    python: {
      args: { n: 0b101101 },
      code: `def count_bits(n):
    count = 0
    while n:
        n = n & (n - 1)
        count += 1
    return count
`,
    },
  },
  {
    id: 'tower-of-hanoi',
    title: 'Tower of Hanoi',
    category: 'Recursion',
    blurb: 'Three pegs, one recursive idea.',
    expects: ['calltree', 'stack'],
    python: {
      args: { n: 3 },
      code: `def hanoi(n):
    pegs = {'A': list(range(n, 0, -1)), 'B': [], 'C': []}

    def move(k, src, dst, spare):
        if k == 0:
            return
        move(k - 1, src, spare, dst)
        pegs[dst].append(pegs[src].pop())
        move(k - 1, spare, dst, src)

    move(n, 'A', 'C', 'B')
    return pegs
`,
    },
  },
];
