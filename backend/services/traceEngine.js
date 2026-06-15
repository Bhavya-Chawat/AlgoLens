const Groq = require('groq-sdk');

function generateDriver(language, code, testInput) {
  let driver = '';
  let methodName = '';
  const lang = (language || '').toLowerCase();

  let argsToPass = [];
  if (Array.isArray(testInput) && testInput.length > 0) {
    const first = testInput[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      argsToPass = Object.values(first);
    } else {
      argsToPass = [first]; // Fallback if it's an array of primitives
    }
  } else {
    argsToPass = [testInput];
  }

  if (lang.includes('python')) {
    const match = code.match(/def\s+([a-zA-Z_]\w*)\s*\(\s*self/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = argsToPass.map(i => JSON.stringify(i)).join(', ');
      driver = `\n\n# AUTO-GENERATED DRIVER\nsol = Solution()\nresult = sol.${methodName}(${args})\nprint(result)\n`;
    }
  } else if (lang.includes('java') && !lang.includes('javascript')) {
    const match = code.match(/class\s+Solution\s*\{[\s\S]*?(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>,\s\[\]]+)\s+([a-zA-Z_]\w*)\s*\(/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = argsToPass.map(i => JSON.stringify(i).replace(/\[/g, '{').replace(/\]/g, '}')).join(', ');
      driver = `\n\n// AUTO-GENERATED DRIVER\npublic class Main {\n    public static void main(String[] args) {\n        Solution sol = new Solution();\n        Object result = sol.${methodName}(${args});\n        System.out.println(result);\n    }\n}\n`;
    }
  } else if (lang.includes('cpp') || lang.includes('c++') || lang.includes('c_cpp')) {
    const match = code.match(/class\s+Solution\s*\{[\s\S]*?public:\s*(?:[\w<>,\s\[\]\*\&]+)\s+([a-zA-Z_]\w*)\s*\(/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = argsToPass.map(i => JSON.stringify(i).replace(/\[/g, '{').replace(/\]/g, '}')).join(', ');
      driver = `\n\n// AUTO-GENERATED DRIVER\nint main() {\n    Solution sol;\n    auto result = sol.${methodName}(${args});\n    return 0;\n}\n`;
    }
  } else if (lang.includes('javascript') || lang.includes('js') || lang.includes('typescript') || lang.includes('ts')) {
    const matchVar = code.match(/(?:var|let|const)\s+([a-zA-Z_]\w*)\s*=\s*function/);
    if (matchVar) {
      methodName = matchVar[1];
      const args = argsToPass.map(i => JSON.stringify(i)).join(', ');
      driver = `\n\n// AUTO-GENERATED DRIVER\nconst result = ${methodName}(${args});\nconsole.log(result);\n`;
    } else {
      const matchClass = code.match(/class\s+Solution\s*\{[\s\S]*?([a-zA-Z_]\w*)\s*\(/);
      if (matchClass) {
        methodName = matchClass[1];
        const args = argsToPass.map(i => JSON.stringify(i)).join(', ');
        driver = `\n\n// AUTO-GENERATED DRIVER\nconst sol = new Solution();\nconst result = sol.${methodName}(${args});\nconsole.log(result);\n`;
      }
    }
  }

  return driver ? code + driver : code;
}

/**
 * Simulates code execution via Groq LLM and returns a structured JSON trace
 */
async function getTrace(editorMode, language, code, testInput, apiKey, judge0ApiKey) {
  if (!code || code.trim() === '') {
    return { success: false, error: 'Code is empty. Please write some code before executing.', frames: [] };
  }

  const effectiveKey = apiKey || process.env.GROQ_API_KEY;
  if (!effectiveKey) {
    return { success: false, error: 'No API key available. Set GROQ_API_KEY in .env or provide a custom key.', frames: [] };
  }

  const groq = new Groq({ apiKey: effectiveKey });

  const runnableCode = generateDriver(language, code, testInput);

  const systemPrompt = `You are a strict code visualizer. Mentally execute the ${language} code and output a JSON trace. NO markdown outside JSON.

CRITICAL INSTRUCTIONS:
1. FAST-FORWARD LOOPS (CRITICAL): You MUST NOT trace every single iteration of a loop. Show the first 1-2 iterations, then FAST-FORWARD to the final iterations or a major state change (like a new maximum). Omit the repetitive middle iterations entirely!
2. KEY-STEP DEBUGGING: Group trivial operations (like 'if' + 'assignment' + 'increment') into ONE single frame. Do NOT output a frame for every single line.
3. STRICT FRAME LIMIT: The trace MUST NOT exceed 20 frames. If you are approaching 20 frames, aggressively skip to the final result.
4. 'dataStructureState': MUST use a non-generic type if a primary structure exists. Forbidden to use "type": "generic" if there is a structure.
5. 'codeWithValues': Mandatory every frame. Show the most important line with variable values (e.g., 'if nums[1] < 9').
6. 'explanation': Extremely concise (< 10 words).
7. 'event': MUST be one of function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
8. DIFF-ONLY OUTPUT (CRITICAL):
   - FRAME 0 MUST INCLUDE ALL VARIABLES: You MUST output the full string/array and any sets/maps in 'v' in the very first frame so the frontend can see them!
   - AFTER FRAME 0, NEVER REPEAT UNCHANGED DATA. The backend deep merges everything!
   - 'd' (dataStructureState): OMIT entirely if nothing changed. If it changed, output ONLY the specific properties that changed.
   - For 'd.nd' (nodes) & 'recursionTree.nodes', output ONLY nodes that changed.
   - 'v' (variables): Output ONLY variables that changed. OMIT unchanged properties within them.
7. 'returnValue': EXACT primitive only (e.g. "0").
8. ARRAY AS BINARY TREE: If input is level-order array, root is index 0. Left: 2*i+1, Right: 2*i+2. Do NOT hallucinate nulls.
9. DATA STRUCTURE TAXONOMY & PRIORITY (CRITICAL): MUST use EXACTLY ONE 'dataStructureState.type'.
   PRIORITY RULES: Rich visualizers (trees, graphs, windows) ALWAYS override helper structures (maps, sets, queues).
   [PRIORITY 1 - Topology]:
   - binary_tree/linked_list: nodes[] array (id, val, next/left/right, highlight, label).
   - graph: Adjacency list.
   - trie: nested dictionary, NEVER node arrays.
   [PRIORITY 2 - Algorithmic]:
   - sliding_window: MUST use this if the algorithm uses a moving window (e.g. left/right pointers). You MUST output 'w': [left_index, right_index] to draw the box!
   - two_pointers: Use if algorithm has two independent pointers (e.g. left/right, slow/fast).
   - interval: 2D array [start, end].
   [PRIORITY 3 - Arrays/Matrices]:
   - matrix: 2D grids/boards.
   - array: 1D arrays/strings.
   [PRIORITY 4 - Helpers (ONLY use if NO Priority 1-3 structure exists!)]:
   - hashmap: key-value state.
   - set: flat array.
   - stack/queue: array.
   - priority_queue: ALWAYS flat 0-indexed array, NEVER objects.
   [OTHER]:
   - union_find: 'parent' & 'rank' arrays.
   - segment_tree/fenwick_tree: flat 0-indexed array, NEVER objects.
   - prefix_sum: cumulative sums array.
   - monotonic_stack: find next greater/smaller.
   - bitwise: raw ints.
   - recursion: implicit call stack.
   - generic: fallback.

10. CHAIN OF THOUGHT (CRITICAL FOR TREES/RECURSION):
    Write a VERY BRIEF '<scratchpad>' block to trace recursive calls/tree pointers. Keep it to a few words.
    <scratchpad>
    S1: left=maxDepth(9)
    ...
    </scratchpad>
    \`\`\`json
    { ... }
    \`\`\`

11. JSON ESCAPING: Use single quotes or escape double quotes (\\").
12. DP METADATA: If DP, include 'dp_derivation: [idx1, idx2]' if possible.

JSON SCHEMA TO FOLLOW EXACTLY:
{
  "metadata": {"algorithm": "Name", "dataStructure": "Main DS", "timeComplexity": "O(?)", "spaceComplexity": "O(?)"},
  "frames": [
    {
      "line": <number>,
      "event": "<function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case>",
      "c": "code with var values",
      "e": "Human-readable (<10 words)",
      "v": {
        "varName": <value/object> // MUST BE VALID JSON! Output sets as arrays. NO raw JS like 'new Set()'.
      },
      "d": {
        "t": "array|binary_tree|graph|linked_list|stack|queue|hashmap|sliding_window|bitwise|generic",
        "n": "<EXACT_VAR_NAME>", // e.g., "s" or "nums". MUST MATCH the variable name in 'v'!
        "p": {"i": 0, "left": 0}, "w": [0, 3], "h": [0, 3],
        "nd": [{"id": 0, "val": 3, "left": 1, "right": 2, "next": 1, "highlight": "active|visited|none", "label": "curr"}]
      },
      "recursionTree": {
        "nodes": [{"id": 0, "label": "f()", "status": "active|waiting|done", "returnValue": "...", "parentId": null}]
      }
    }
  ],
  "result": <final value>
}

Test Input: ${JSON.stringify(testInput)}

User Code:
${runnableCode}`;

  try {
    const systemMessage = systemPrompt.split("Test Input:")[0];
    const userMessage = "Test Input:" + systemPrompt.split("Test Input:")[1] + "\n\nCRITICAL: Provide full output containing all essential algorithm steps. You MUST reach the final return statement. Combine mundane steps and skip trivial initialization lines to save space.";

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 4000
    });

    let responseContent = completion.choices[0]?.message?.content || "{}";

    if (completion.usage) {
      console.log(`[TraceEngine] Token Usage: Prompt=${completion.usage.prompt_tokens}, Completion=${completion.usage.completion_tokens}, Total=${completion.usage.total_tokens}`);
    }

    // DEBUG: Save raw LLM response to disk
    // Debugging only, file removed for prod safety

    // Robustly extract JSON, ignoring scratchpad even if it has braces
    let jsonStr = responseContent;
    const jsonBlockMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1];
    } else {
      const fallbackMatch = responseContent.match(/\{[\s\S]*"frames"\s*:[\s\S]*\}/);
      if (fallbackMatch) {
        jsonStr = fallbackMatch[0];
      } else {
        // Find the first `{` and last `}` as a last resort
        const firstBrace = responseContent.indexOf('{');
        const lastBrace = responseContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = responseContent.substring(firstBrace, lastBrace + 1);
        }
      }
    }

    // Clean up any trailing garbage after the JSON object
    jsonStr = jsonStr.trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // Try to repair truncated JSON (LLM token limit reached)
      try {
        const lastCompleteFrame = jsonStr.lastIndexOf('},');
        if (lastCompleteFrame > 0) {
          const repairedStr = jsonStr.substring(0, lastCompleteFrame + 1) + ']}';
          result = JSON.parse(repairedStr);
          result.error = "The trace was too long and was truncated. Some later steps are missing.";
          console.log("Successfully repaired truncated JSON.");
        } else {
          throw parseError;
        }
      } catch (e) {
        console.error("Failed to parse JSON trace:", parseError, "Raw string was:", jsonStr.substring(0, 100) + "...");
        result = { frames: [], error: "LLM output could not be parsed as valid JSON. It may have exceeded token limits." };
      }
    }

    // Add IDs to frames
    if (result.frames && Array.isArray(result.frames)) {
      result.frames.forEach((f, i) => {
        // Expand shortcodes
        if (f.c !== undefined) { f.codeWithValues = f.c; delete f.c; }
        if (f.e !== undefined) { f.explanation = f.e; delete f.e; }
        if (f.v !== undefined) { f.variables = f.v; delete f.v; }
        if (f.d !== undefined) {
          f.dataStructureState = f.d; delete f.d;
          let d = f.dataStructureState;
          if (d.t !== undefined) { d.type = d.t; delete d.t; }
          if (d.n !== undefined) { d.name = d.n; delete d.n; }
          if (d.p !== undefined) { d.pointers = d.p; delete d.p; }
          if (d.w !== undefined) { d.window = d.w; delete d.w; }
          if (d.h !== undefined) { d.highlights = d.h; delete d.h; }
          if (d.nd !== undefined) { d.nodes = d.nd; delete d.nd; }
        }

        f.id = i;
        if (!f.variables) f.variables = {};

        // Auto-infer variables if they are raw primitives
        for (const [k, v] of Object.entries(f.variables)) {
          if (v !== null && typeof v === 'object' && 'value' in v) {
            continue; // Already formatted
          }
          let type = 'generic';
          if (typeof v === 'number') type = 'int';
          else if (typeof v === 'boolean') type = 'bool';
          else if (typeof v === 'string') type = 'str';
          else if (Array.isArray(v)) type = 'list';
          else if (v && typeof v === 'object') type = 'dict';
          f.variables[k] = { type, value: v };
        }

        // Carry over data structures if omitted (token optimization)
        if (i > 0) {
          if (result.frames[i - 1].dataStructureState) {
            if (!f.dataStructureState) f.dataStructureState = {};
            const prevDS = result.frames[i - 1].dataStructureState;
            for (const key of Object.keys(prevDS)) {
              if (!(key in f.dataStructureState)) {
                f.dataStructureState[key] = JSON.parse(JSON.stringify(prevDS[key]));
              } else if (key === 'pointers' && typeof f.dataStructureState.pointers === 'object' && typeof prevDS.pointers === 'object') {
                f.dataStructureState.pointers = { ...prevDS.pointers, ...f.dataStructureState.pointers };
              } else if (key === 'nodes' && Array.isArray(f.dataStructureState.nodes) && Array.isArray(prevDS.nodes)) {
                const newNodesMap = new Map();
                f.dataStructureState.nodes.forEach(n => {
                  if (n && n.id !== undefined) newNodesMap.set(n.id, n);
                });

                if (newNodesMap.size > 0 && newNodesMap.size === f.dataStructureState.nodes.length) {
                  const mergedNodes = prevDS.nodes.map(n => {
                    if (newNodesMap.has(n.id)) {
                      const updatedNode = newNodesMap.get(n.id);
                      newNodesMap.delete(n.id);
                      if (updatedNode._delete) return null;
                      return { ...n, ...updatedNode };
                    }
                    return JSON.parse(JSON.stringify(n));
                  }).filter(n => n !== null);
                  newNodesMap.forEach(n => {
                    if (!n._delete) mergedNodes.push(n);
                  });
                  f.dataStructureState.nodes = mergedNodes;
                }
              }
            }
          }

          if (result.frames[i - 1].recursionTree) {
            if (!f.recursionTree) f.recursionTree = {};
            const prevRT = result.frames[i - 1].recursionTree;
            for (const key of Object.keys(prevRT)) {
              if (!(key in f.recursionTree)) {
                f.recursionTree[key] = JSON.parse(JSON.stringify(prevRT[key]));
              } else if (key === 'nodes' && Array.isArray(f.recursionTree.nodes) && Array.isArray(prevRT.nodes)) {
                const newNodesMap = new Map();
                f.recursionTree.nodes.forEach(n => {
                  if (n && n.id !== undefined) newNodesMap.set(n.id, n);
                });

                if (newNodesMap.size > 0 && newNodesMap.size === f.recursionTree.nodes.length) {
                  const mergedNodes = prevRT.nodes.map(n => {
                    if (newNodesMap.has(n.id)) {
                      const updatedNode = newNodesMap.get(n.id);
                      newNodesMap.delete(n.id);
                      if (updatedNode._delete) return null;
                      return { ...n, ...updatedNode };
                    }
                    return JSON.parse(JSON.stringify(n));
                  }).filter(n => n !== null);
                  newNodesMap.forEach(n => {
                    if (!n._delete) mergedNodes.push(n);
                  });
                  f.recursionTree.nodes = mergedNodes;
                }
              }
            }
          }

          // Carry over missing variables
          const prevVars = result.frames[i - 1].variables || {};
          for (const k of Object.keys(prevVars)) {
            if (!(k in f.variables)) {
              f.variables[k] = JSON.parse(JSON.stringify(prevVars[k]));
            } else if (typeof f.variables[k] === 'object' && typeof prevVars[k] === 'object') {
              f.variables[k] = { ...prevVars[k], ...f.variables[k] };
            }
          }
        }

        // Ensure prevValue exists for inspector
        if (i > 0) {
          const prevVars = result.frames[i - 1].variables || {};
          for (const [k, v] of Object.entries(f.variables)) {
            v.prevValue = prevVars[k] ? prevVars[k].value : undefined;
            v.changedThisFrame = JSON.stringify(v.value) !== JSON.stringify(v.prevValue);
          }
        } else {
          for (const v of Object.values(f.variables)) {
            v.changedThisFrame = true;
          }
        }
      });
    }

    return {
      success: true,
      frames: result.frames || [],
      result: result.result
    };

  } catch (error) {
    console.error("Tracing error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate trace via AI simulation",
      frames: []
    };
  }
}

module.exports = {
  getTrace
};
