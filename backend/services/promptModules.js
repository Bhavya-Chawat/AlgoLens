const CORE_RULES = `
CRITICAL INSTRUCTIONS:
1. VISUAL SUMMARY & PACING (CRITICAL): Mentally execute the FULL algorithm. Aim for 10-20 essential frames. If the execution is very short, trace every step. If it exceeds 20 steps, YOU MUST AGGRESSIVELY SUMMARIZE. E.g., for long loops, show ONLY the 1st iteration, then SKIP directly to the final return or final iteration. This gives the user a high-level summary they can expand later.
2. EXPAND FEATURE AVAILABLE: If you skip ANY repetitive middle steps, set the top-level 'isSummarized' boolean to true. ALSO, you MUST add '"skippedNext": true' to the exact frame immediately BEFORE the skipped steps (e.g. if you show i=1, skip i=2, and show i=3, you must put "skippedNext": true on the i=1 frame).
3. STRICT FRAME LIMIT: The trace MUST NOT exceed 25 frames under any circumstance.
4. 'codeWithValues' (CRITICAL): You MUST substitute the actual variable values directly into the code snippet! DO NOT just output the raw code. (e.g., output 'Math.max(3, 7 - 0 + 1)' instead of 'Math.max(maxLength, right - left + 1)').
5. 'explanation': Extremely concise (< 10 words).
6. DIFF-ONLY OUTPUT (CRITICAL):
   - FRAME 0 MUST INCLUDE ALL VARIABLES FULLY: Output the full string/array and any sets/maps in 'v'.
   - AFTER FRAME 0, NEVER REPEAT UNCHANGED DATA. The backend deep merges everything!
   - 'd' (dataStructureState): OMIT entirely if nothing changed.
   - 'v' (variables): Output ONLY variables that changed.
   - SMART DELTAS FOR COLLECTIONS (CRITICAL): After Frame 0, NEVER output the full array/set/map again! Use these commands:
     * To append/add elements: "mySet": {"_add": ["c"]}
     * To remove elements/keys: "mySet": {"_remove": ["a"]}
     * To update map keys or array indices: "myMap": {"_set": {"count": 2}}
7. 'returnValue': EXACT primitive only (e.g. "0").
8. ARRAY AS BINARY TREE: Input is LeetCode level-order format. Use the provided CRITICAL TREE JSON HINT.
9. CALL STACK ('cs'): OMIT ENTIRELY unless the algorithm is recursive. Do not output 'cs' for simple loops.

10. CHAIN OF THOUGHT (CRITICAL FOR MATH & RECURSION):
    Write a VERY BRIEF '<scratchpad>' block BEFORE the JSON.
    <scratchpad>
    S1: left=maxDepth(9)
    </scratchpad>
    \`\`\`json
    { ... }
    \`\`\`

11. STRICT JSON FORMATTING (CRITICAL):
    - JSON values MUST be wrapped in double quotes. If you need quotes INSIDE a string, use single quotes (e.g. "c": "set.add('a')").
    - NO unescaped newlines (\\n).
    - NO JS-only types like undefined, NaN, Infinity. Use null or strings.

JSON SCHEMA TO FOLLOW EXACTLY:
{
  "isSummarized": true/false,
  "algorithmName": "Detected Algorithm Name or null",
  "metadata": {"algorithm": "Name", "dataStructure": "Main DS", "timeComplexity": "O(?)", "spaceComplexity": "O(?)"},
  "frames": [
    {
      "line": <number>,
      "event": "function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case | add_to_set",
      "skippedNext": true, // ONLY IF you are skipping frames after this one!
      "c": "code with var values",
      "e": "Human-readable (<10 words)",
      "v": {
        "varName": <value/object>
      },
      "d": {
        "t": "<TYPE_ENUM>",
        "n": "<EXACT_VAR_NAME>",
        "p": {"i": 0, "left": 0}, "w": [0, 3], "h": [0, 3],
        "nd": [{"id": 0, "val": 3, "left": 1, "right": 2, "next": 1, "highlight": "active|visited|none", "label": "curr"}]
      },
      "cs": ["dfs(root, 2)", "dfs(root.left, 1)"], // FULL unbroken call stack array.
      "returnValue": "..."
    }
  ],
  "result": <final value>
}
`;

const STRUCTURE_RULES = {
  array: "- Use 'd.t': 'array'. Output elements in 'v'. Use 'd.p' for pointer indices like {'i': 0}.",
  string: "- Use 'd.t': 'array'. Output the string normally as a literal string in 'v' (do NOT break into character array).",
  matrix: "- Use 'd.t': 'matrix'. Output 2D arrays/grids. Use 'd.p' to highlight specific (r, c) cells.",
  binary_tree: "- Use 'd.t': 'binary_tree'. Provide 'd.nd' nodes array (id, val, left, right, highlight).",
  binary_search_tree: "- Use 'd.t': 'binary_tree'. Provide 'd.nd' nodes array (id, val, left, right, highlight).",
  n_ary_tree: "- Use 'd.t': 'n_ary_tree'. Provide 'd.nd' nodes array (id, val, children, highlight).",
  graph_adj_list: "- Use 'd.t': 'graph'. Output Adjacency List. Highlight 'visited' nodes.",
  graph_adj_matrix: "- Use 'd.t': 'matrix'. Treat the adjacency matrix as a 2D grid.",
  graph_edge_list: "- Use 'd.t': 'generic'. Just list the edges.",
  trie: "- Use 'd.t': 'trie'. Provide nested dictionary representing the prefix tree. NEVER node arrays.",
  linked_list: "- Use 'd.t': 'linked_list'. Provide 'd.nd' nodes array (id, val, next, highlight).",
  doubly_linked_list: "- Use 'd.t': 'linked_list'. Provide 'd.nd' nodes array (id, val, next, prev, highlight).",
  stack: "- Use 'd.t': 'stack'. Output elements as an array in 'v'.",
  monotonic_stack: "- Use 'd.t': 'stack'. Highlight the top element and elements being popped.",
  queue: "- Use 'd.t': 'queue'. Output elements as an array in 'v'.",
  priority_queue: "- Use 'd.t': 'priority_queue'. ALWAYS flat 0-indexed array representing the heap.",
  none: "- No primary structure. Use 'd.t': 'generic'.",
  generic: "- Use 'd.t': 'generic'."
};

const HELPER_RULES = {
  hashmap: "- Helper HashMap: Provide key-value state in 'v'.",
  hashset: "- Helper HashSet: Provide flat array in 'v'.",
  array_map: "- Helper ArrayMap: Output as a flat array in 'v'.",
  queue: "- Helper Queue: Provide flat array in 'v'.",
  deque: "- Helper Deque: Provide flat array in 'v'.",
  priority_queue: "- Helper Priority Queue: Provide flat array representing heap in 'v'.",
  stack: "- Helper Stack: Provide flat array in 'v'.",
  monotonic_stack: "- Helper Monotonic Stack: Provide flat array in 'v'.",
  union_find: "- Helper Union Find: Provide 'parent' and 'rank' arrays.",
  fenwick_tree: "- Helper Fenwick Tree: Provide 1-indexed flat array in 'v'.",
  segment_tree: "- Helper Segment Tree: Provide flat 0-indexed array.",
  doubly_linked_list: "- Helper LinkedList: Track head/tail pointers."
};

const PATTERN_RULES = {
  sliding_window: "- PATTERN: Sliding Window. Output 'w': [left_index, right_index] in 'd' to draw the box! CRITICAL: If the window slides over many characters, skip middle iterations and combine mundane steps.",
  fixed_sliding_window: "- PATTERN: Fixed Sliding Window. Output 'w': [left_index, right_index] in 'd'. CRITICAL: Skip middle iterations for long arrays.",
  two_pointers: "- PATTERN: Two Pointers. Use 'd.p' to highlight both pointers (e.g., {'left': 0, 'right': 5}). CRITICAL: If pointers move across a large array, skip mundane middle steps.",
  fast_slow_pointers: "- PATTERN: Fast/Slow Pointers. Highlight 'slow' and 'fast' indices in 'd.p'.",
  three_pointers: "- PATTERN: Three Pointers. Highlight all three pointers in 'd.p'.",
  divide_and_conquer: "- PATTERN: Divide & Conquer. Track the 'cs' Call Stack. Show how arrays split.",
  backtracking: "- PATTERN: Backtracking. Track the recursive 'cs' Call Stack. CRITICAL: Skip deep mundane branches if tree is large.",
  combinations_permutations: "- PATTERN: Combinations/Permutations. Track the recursion 'cs'. CRITICAL: Skip repetitive combinations.",
  "1d_dp": "- PATTERN: 1D DP. Track the DP array filling up. CRITICAL: Skip middle fills for long arrays.",
  "2d_dp": "- PATTERN: 2D DP. Track the DP matrix filling up. CRITICAL: Skip mundane cell calculations.",
  state_machine_dp: "- PATTERN: State Machine DP. Clearly show state transitions.",
  tree_dp: "- PATTERN: Tree DP. Combine Tree node highlights with DP states.",
  greedy: "- PATTERN: Greedy. Highlight the local optimal choice at each step.",
  prefix_sum: "- PATTERN: Prefix Sum. Show the cumulative sums array filling up.",
  suffix_sum: "- PATTERN: Suffix Sum. Show the suffix array filling up.",
  difference_array: "- PATTERN: Difference Array. Show range updates.",
  binary_search: "- PATTERN: Binary Search. Use 'w': [left, right] to show the search space and 'd.p': {'mid': 2} to highlight mid.",
  binary_search_on_answer: "- PATTERN: Binary Search on Answer. Highlight the search space.",
  bitwise_manipulation: "- PATTERN: Bitwise. Show raw integer values changing.",
  string_matching: "- PATTERN: String Matching. Highlight the matching windows/characters in 'd.w'.",
  topological_sort: "- PATTERN: Topological Sort. Track in-degrees and the processing queue.",
  bfs: "- PATTERN: BFS. Track the Queue and the Visited Set/Array.",
  dfs: "- PATTERN: DFS. CRITICALLY track the 'cs' Call Stack.",
  dijkstra: "- PATTERN: Dijkstra's. Track the Priority Queue and shortest distance array.",
  bellman_ford: "- PATTERN: Bellman Ford. Track edge relaxations.",
  floyd_warshall: "- PATTERN: Floyd Warshall. Track the 2D distance matrix.",
  kruskal: "- PATTERN: Kruskal. Track the Union Find state and sorted edges.",
  prim: "- PATTERN: Prim. Track the Priority Queue and Visited Set.",
  cycle_detection: "- PATTERN: Cycle Detection. Highlight the back-edge or fast/slow collision.",
  intervals_merge: "- PATTERN: Intervals. Output 'd.t': 'interval' with 2D array [start, end].",
  sweep_line: "- PATTERN: Sweep Line. Track the sorted events processing.",
  monotonic_queue: "- PATTERN: Monotonic Queue. Highlight the front/back elements being pushed/popped.",
  counting_sort: "- PATTERN: Counting Sort. Show the frequency array filling up.",
  bucket_sort: "- PATTERN: Bucket Sort. Show items distributing into buckets.",
  radix_sort: "- PATTERN: Radix Sort. Highlight the digit being sorted.",
  quick_select: "- PATTERN: Quick Select. Show the pivot and partitioning.",
  reservoir_sampling: "- PATTERN: Reservoir Sampling. Highlight the randomly chosen replacements.",
  generic: "- PATTERN: Generic logic execution."
};

/**
 * Dynamically assembles the full prompt based on the code analysis.
 */
function buildPrompt(analysis, language, code, testInput, buildTreeHint) {
  let prompt = `You are a strict code visualizer. Mentally execute the ${language} code and output a JSON trace. NO markdown outside JSON.
`;

  prompt += CORE_RULES;

  prompt += "\n--- SPECIFIC ARCHITECTURE RULES ---\n";
  
  if (analysis.primaryStructure && STRUCTURE_RULES[analysis.primaryStructure]) {
    prompt += STRUCTURE_RULES[analysis.primaryStructure] + "\n";
  }

  if (analysis.helpers && analysis.helpers.length > 0) {
    analysis.helpers.forEach(h => {
      if (HELPER_RULES[h]) prompt += HELPER_RULES[h] + "\n";
    });
  }

  if (analysis.pattern && PATTERN_RULES[analysis.pattern]) {
    prompt += PATTERN_RULES[analysis.pattern] + "\n";
  }

  prompt += `
Test Input: ${JSON.stringify(testInput)}${buildTreeHint ? buildTreeHint(testInput) : ''}

User Code:
${code}`;

  return prompt;
}

module.exports = { buildPrompt };
