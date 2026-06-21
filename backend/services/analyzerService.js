const { Groq } = require('groq-sdk');

/**
 * Analyzes the source code to determine the optimal visualization strategy.
 * Returns a JSON object with primary structure, helpers, and algorithm pattern.
 */
async function analyzeCode(language, code, apiKey) {
  const effectiveKey = apiKey || process.env.GROQ_API_KEY;
  if (!effectiveKey) {
    throw new Error('No API key available for Analyzer.');
  }

  const groq = new Groq({ apiKey: effectiveKey });

  const systemPrompt = `You are a strict code analyzer for an algorithm visualizer.
Your job is to read the provided source code and classify it exactly according to the strict Enums below.
You MUST output valid JSON only.

{
  "primaryStructure": "array | string | matrix | binary_tree | binary_search_tree | n_ary_tree | graph_adj_list | graph_adj_matrix | graph_edge_list | trie | linked_list | doubly_linked_list | stack | monotonic_stack | queue | priority_queue | none",
  "helpers": [
    "hashmap", "hashset", "array_map", "queue", "deque", 
    "priority_queue", "stack", "monotonic_stack", "union_find", 
    "fenwick_tree", "segment_tree", "doubly_linked_list"
  ],
  "pattern": "sliding_window | fixed_sliding_window | two_pointers | fast_slow_pointers | three_pointers | divide_and_conquer | backtracking | combinations_permutations | 1d_dp | 2d_dp | state_machine_dp | tree_dp | greedy | prefix_sum | suffix_sum | difference_array | binary_search | binary_search_on_answer | bitwise_manipulation | string_matching | topological_sort | bfs | dfs | dijkstra | bellman_ford | floyd_warshall | kruskal | prim | cycle_detection | intervals_merge | sweep_line | monotonic_queue | counting_sort | bucket_sort | radix_sort | quick_select | reservoir_sampling | generic",
  "algorithmName": "String (e.g., 'Kadane\\'s Algorithm', 'KMP Algorithm') or null if no famous name"
}

RULES:
1. 'primaryStructure' MUST be exactly ONE of the options. Pick the dominant structure guiding the logic.
2. 'helpers' MUST be an array of 0 or more options. Only include auxiliary data structures explicitly used in the code.
3. 'pattern' MUST be exactly ONE of the options.
4. Output raw JSON only. Do not wrap in markdown blocks like \`\`\`json.`;

  const userMessage = `Language: ${language}\n\nCode:\n${code}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile", // Use a fast/smart model
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content || "{}";
    const analysis = JSON.parse(responseContent);

    // Fallback normalization in case the LLM hallucinates
    if (!analysis.primaryStructure) analysis.primaryStructure = "generic";
    if (!Array.isArray(analysis.helpers)) analysis.helpers = [];
    if (!analysis.pattern) analysis.pattern = "generic";

    return analysis;
  } catch (error) {
    console.error("Analyzer Error:", error);
    // Safe fallback if analyzer fails
    return {
      primaryStructure: "generic",
      helpers: [],
      pattern: "generic",
      algorithmName: null
    };
  }
}

module.exports = { analyzeCode };
