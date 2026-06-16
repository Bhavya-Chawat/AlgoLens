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

function buildTreeHint(testInput) {
  let treeArr = null;

  if (Array.isArray(testInput)) {
    if (testInput.length > 0 && typeof testInput[0] === 'object' && testInput[0] !== null) {
      for (const [key, val] of Object.entries(testInput[0])) {
        if (Array.isArray(val) && (key.toLowerCase().includes('root') || key.toLowerCase().includes('tree') || val.includes(null))) {
          treeArr = val;
          break;
        }
      }
    } else if (testInput.includes(null)) {
      treeArr = testInput;
    }
  }

  if (!Array.isArray(treeArr) || treeArr.length === 0) return '';
  let hintNodes = [];
  let q = [{ val: treeArr[0], id: 0 }];
  let i = 1;
  while (q.length > 0 && i < treeArr.length) {
    let curr = q.shift();
    if (curr.val === null) continue;
    let leftVal = treeArr[i] !== undefined ? treeArr[i] : null;
    let rightVal = treeArr[i + 1] !== undefined ? treeArr[i + 1] : null;

    let leftId = leftVal !== null ? i : null;
    let rightId = rightVal !== null ? i + 1 : null;

    let nodeObj = { id: curr.id, val: curr.val };
    if (leftId !== null) nodeObj.left = leftId;
    if (rightId !== null) nodeObj.right = rightId;
    hintNodes.push(nodeObj);

    if (leftVal !== null) q.push({ val: leftVal, id: i });
    if (rightVal !== null) q.push({ val: rightVal, id: i + 1 });
    i += 2;
  }
  while (q.length > 0) {
    let curr = q.shift();
    if (curr.val !== null) hintNodes.push({ id: curr.id, val: curr.val });
  }
  return '\n(CRITICAL TREE JSON HINT: ' + JSON.stringify(hintNodes) + ')';
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
1. VISUAL SUMMARY & PACING (CRITICAL): The user wants to see this algorithm visualized! Mentally execute the FULL algorithm from start to finish. If the execution is short (under 25 steps), TRACE EVERY SINGLE STEP! If the execution is long, YOU decide which key frames to skip (like trivial loops) to fit the limit. CRITICAL: Do NOT stop the trace prematurely at an intermediate return! You MUST traverse the whole algorithm up until the TRUE final return of the main execution!
2. EXPAND FEATURE AVAILABLE: If the execution is long, provide a highly summarized overview capturing the start, major state changes/turning points, and the final result. The frontend has an 'expand' feature the user can click to drill into missing details, so your primary job is to create a complete but short end-to-end summary!
3. STRICT FRAME LIMIT: The trace MUST NOT exceed 30 frames. Because you are intelligently summarizing the algorithm, you MUST comfortably reach the final return statement.
4. 'dataStructureState': MUST use a non-generic type if a primary structure exists. Forbidden to use "type": "generic" if there is a structure.
5. 'codeWithValues': Mandatory every frame. Show the most important line with variable values (e.g., 'if nums[1] < 9').
6. 'explanation': Extremely concise (< 10 words).
7. 'event': MUST be one of function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
8. DIFF-ONLY OUTPUT (CRITICAL):
   - FRAME 0 MUST INCLUDE ALL VARIABLES: You MUST output the full string/array and any sets/maps in 'v' in the very first frame so the frontend can see them!
   - AFTER FRAME 0, NEVER REPEAT UNCHANGED DATA. The backend deep merges everything!
   - 'd' (dataStructureState): OMIT entirely if nothing changed. If it changed, output ONLY the specific properties that changed.
   - For 'd.nd' (nodes), output ONLY nodes that changed.
   - 'v' (variables): Output ONLY variables that changed. OMIT unchanged properties within them.
9. 'returnValue': EXACT primitive only (e.g. "0").
10. ARRAY AS BINARY TREE: Input is LeetCode level-order format (children of nulls are skipped!). DO NOT hallucinate left/right indices using 2*i+1. Use the provided CRITICAL TREE JSON HINT.
11. DATA STRUCTURE TAXONOMY & PRIORITY (CRITICAL): MUST use EXACTLY ONE 'dataStructureState.type'.
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

10. CHAIN OF THOUGHT (CRITICAL FOR MATH & RECURSION):
    Write a VERY BRIEF '<scratchpad>' block BEFORE the JSON. Mentally trace the math and execution path using highly compact notation (e.g., "5->4->11->7=27!=22. Backtrack 11->2=22. True"). Keep it to a few words to strictly save tokens, but maintain accuracy!
    <scratchpad>
    S1: left=maxDepth(9)
    ...
    </scratchpad>
    \`\`\`json
    { ... }
    \`\`\`

11. STRICT JSON FORMATTING (CRITICAL):
    - NO unescaped double quotes inside strings! Use SINGLE QUOTES for code and values (e.g., "c": "if (char === 'a')").
    - NO unescaped newlines (\n) inside string values.
    - NO JS-only types like undefined, NaN, Infinity. Use null or strings instead.
    - NO trailing commas.
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
      "cs": ["dfs(root, 2)", "dfs(root.left, 1)"], // FULL unbroken call stack array. STRICTLY use short labels! NEVER expand arrays/objects in args!
      "returnValue": "..."
    }
  ],
  "result": <final value>
}

Test Input: ${JSON.stringify(testInput)}${buildTreeHint(testInput)}

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

    let result = JSON.parse(jsonStr);

    // Reconstruct recursion tree from simple 'cs' array to save LLM tokens
    let recursionNodes = [];
    let nextNodeId = 0;
    let activeStackIds = [];

    // Add IDs to frames
    if (result.frames && Array.isArray(result.frames)) {
      result.frames.forEach((f, i) => {
        if (f.cs !== undefined) {
          let newActiveStackIds = [];
          let parentId = null;

          let matchedPrefix = true;
          if (Array.isArray(f.cs)) {
            f.cs.forEach((label, depth) => {
              let nodeId;
              if (matchedPrefix && depth < activeStackIds.length && recursionNodes[activeStackIds[depth]].label === label) {
                nodeId = activeStackIds[depth];
                recursionNodes[nodeId].status = 'active';
              } else {
                matchedPrefix = false;
                nodeId = nextNodeId++;
                recursionNodes.push({ id: nodeId, label: label, status: 'active', parentId: parentId });
              }
              newActiveStackIds.push(nodeId);
              parentId = nodeId;
            });
          }

          for (let j = 0; j < activeStackIds.length; j++) {
            if (j >= newActiveStackIds.length || activeStackIds[j] !== newActiveStackIds[j]) {
              let poppedId = activeStackIds[j];
              recursionNodes[poppedId].status = 'done';
              if (f.returnValue !== undefined && j === activeStackIds.length - 1) {
                recursionNodes[poppedId].returnValue = f.returnValue;
              }
            }
          }

          activeStackIds = newActiveStackIds;

          if (f.returnValue !== undefined && activeStackIds.length > 0 && activeStackIds.length === newActiveStackIds.length) {
            recursionNodes[activeStackIds[activeStackIds.length - 1]].returnValue = f.returnValue;
          }

          f.recursionTree = { nodes: JSON.parse(JSON.stringify(recursionNodes)) };
          delete f.cs;
        } else if (recursionNodes.length > 0) {
          f.recursionTree = { nodes: JSON.parse(JSON.stringify(recursionNodes)) };
        }
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


async function expandTrace(editorMode, language, code, testInput, apiKey, judge0ApiKey, startFrame, endFrame) {
  if (!code || code.trim() === '') {
    return { success: false, error: 'Code is empty.', frames: [] };
  }

  const effectiveKey = apiKey || process.env.GROQ_API_KEY;
  if (!effectiveKey) {
    return { success: false, error: 'No API key available.', frames: [] };
  }

  const groq = new Groq({ apiKey: effectiveKey });
  const runnableCode = generateDriver(language, code, testInput);

  const systemPrompt = `You are a strict code visualizer. Mentally execute the ${language} code and output a JSON trace. NO markdown outside JSON.

CRITICAL INSTRUCTIONS:
1. TARGETED EXPANSION: The user has requested to dig deeper between State A and State B of a summarized trace. You must output the missing intermediate state changes strictly between these two states. If there are NO meaningful conceptual steps missing between State A and State B, you MUST output exactly '{"frames": []}' to refuse expansion! DO NOT hallucinate filler frames!
2. START & END BOUNDARIES: Start generating frames immediately AFTER State A. Stop generating frames immediately BEFORE State B. 
3. DETAILED DEBUGGING: Output a frame for meaningful execution lines, but skip entirely trivial operations that do not change the state or conceptual flow.
4. FRAME LIMIT (CRITICAL): DO NOT generate more than 10 frames. Pick the most important 5 to 10 intermediate frames that bridge the gap conceptually without overwhelming the user.
5. 'dataStructureState': MUST use a non-generic type if a primary structure exists. Forbidden to use "type": "generic" if there is a structure.
6. 'codeWithValues': Mandatory every frame. Show the most important line with variable values.
7. 'explanation': Extremely concise (< 10 words).
8. 'event': MUST be one of function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
9. DIFF-ONLY OUTPUT (CRITICAL):
   - FRAME 0 MUST INCLUDE ALL VARIABLES: You MUST output the full string/array and any sets/maps in 'v' in the very first frame!
   - AFTER FRAME 0, NEVER REPEAT UNCHANGED DATA.
   - RECURSION: If a function is called or returns in these intermediate steps, you MUST include the 'recursionTree' object with the added or updated node.

10. BRIEF SCRATCHPAD ALLOWED:
    You MUST write a 1-2 line <scratchpad> to trace the recursive math and call stack so you don't hallucinate!
    <scratchpad>
    Trace: ...
    </scratchpad>

11. STRICT JSON FORMATTING (CRITICAL):
    - NO unescaped double quotes inside strings! Use SINGLE QUOTES for code and values (e.g., "c": "if (char === 'a')").
    - NO unescaped newlines (\n) inside string values.
    - NO JS-only types like undefined, NaN, Infinity. Use null or strings instead.
    - NO trailing commas.

JSON SCHEMA TO FOLLOW EXACTLY:
{
  "frames": [
    {
      "line": <number>,
      "event": "<function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case>",
      "c": "code with var values",
      "e": "Human-readable (<10 words)",
      "v": {
        "varName": <value/object>
      },
      "d": {
        "t": "array|binary_tree|graph|linked_list|stack|queue|hashmap|sliding_window|bitwise|generic",
        "n": "<EXACT_VAR_NAME>", 
        "p": {"i": 0, "left": 0}, "w": [0, 3], "h": [0, 3],
        "nd": [{"id": 0, "val": 3, "left": 1, "right": 2, "next": 1, "highlight": "active|visited|none", "label": "curr"}]
      },
      "cs": ["dfs(root, 2)", "dfs(root.left, 1)"] // FULL unbroken call stack array. STRICTLY use short labels! NEVER expand arrays/objects in args!
    }
  ]
}

Test Input: ${JSON.stringify(testInput)}${buildTreeHint(testInput)}

User Code:
${runnableCode}

State A (Start Point):
${JSON.stringify(startFrame)}

State B (End Point):
${JSON.stringify(endFrame)}`;

  try {
    const systemMessage = systemPrompt.split("State A (Start Point):")[0];
    const userMessage = "State A (Start Point):\n" + systemPrompt.split("State A (Start Point):")[1] + "\n\nCRITICAL: Trace the missing steps between State A and State B. If there is nothing meaningful to expand or only trivial operations exist, return an empty frames array {\"frames\": []} to refuse expansion.";

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 5000
    });

    let responseContent = completion.choices[0]?.message?.content || "{}";
    let tokenUsage = null;
    if (completion.usage) {
      tokenUsage = { prompt: completion.usage.prompt_tokens, completion: completion.usage.completion_tokens, total: completion.usage.total_tokens };
      console.log(`[TraceEngine Expand] Token Usage: Prompt=${completion.usage.prompt_tokens}, Completion=${completion.usage.completion_tokens}, Total=${completion.usage.total_tokens}`);
    }

    let jsonStr = responseContent;
    const jsonBlockMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonBlockMatch) jsonStr = jsonBlockMatch[1];
    else {
      const fallbackMatch = responseContent.match(/\{[\s\S]*"frames"\s*:[\s\S]*\}/);
      if (fallbackMatch) jsonStr = fallbackMatch[0];
      else {
        const firstBrace = responseContent.indexOf('{');
        const lastBrace = responseContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) jsonStr = responseContent.substring(firstBrace, lastBrace + 1);
      }
    }

    jsonStr = jsonStr.trim();
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse JSON trace:", parseError, "Raw string was:", jsonStr.substring(0, 100) + "...");
      result = { frames: [], error: "LLM output could not be parsed as valid JSON. It may have exceeded token limits or produced invalid formatting." };
    }

    if (result.frames && Array.isArray(result.frames)) {
      if (startFrame) {
        result.frames.unshift(JSON.parse(JSON.stringify(startFrame)));
      }

      let recursionNodes = [];
      let nextNodeId = 0;
      let activeStackIds = [];

      result.frames.forEach((f, i) => {
        if (f.cs !== undefined) {
          let newActiveStackIds = [];
          let parentId = null;

          if (Array.isArray(f.cs)) {
            f.cs.forEach((label, depth) => {
              let nodeId;
              if (depth < activeStackIds.length && recursionNodes[activeStackIds[depth]].label === label) {
                nodeId = activeStackIds[depth];
                recursionNodes[nodeId].status = 'active';
              } else {
                nodeId = nextNodeId++;
                recursionNodes.push({ id: nodeId, label: label, status: 'active', parentId: parentId });
              }
              newActiveStackIds.push(nodeId);
              parentId = nodeId;
            });
          }

          for (let j = newActiveStackIds.length; j < activeStackIds.length; j++) {
            let poppedId = activeStackIds[j];
            recursionNodes[poppedId].status = 'done';
            if (f.returnValue !== undefined && j === activeStackIds.length - 1) {
              recursionNodes[poppedId].returnValue = f.returnValue;
            }
          }

          activeStackIds = newActiveStackIds;

          if (f.returnValue !== undefined && activeStackIds.length > 0 && activeStackIds.length === newActiveStackIds.length) {
            recursionNodes[activeStackIds[activeStackIds.length - 1]].returnValue = f.returnValue;
          }

          f.recursionTree = { nodes: JSON.parse(JSON.stringify(recursionNodes)) };
          delete f.cs;
        } else if (recursionNodes.length > 0) {
          f.recursionTree = { nodes: JSON.parse(JSON.stringify(recursionNodes)) };
        }
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

        // We do not want to override existing clean variables on startFrame (i=0)
        if (i > 0 || !startFrame) {
          f.id = i;
          if (!f.variables) f.variables = {};

          for (const [k, v] of Object.entries(f.variables)) {
            if (v !== null && typeof v === 'object' && 'value' in v) continue;
            let type = 'generic';
            if (typeof v === 'number') type = 'int';
            else if (typeof v === 'boolean') type = 'bool';
            else if (typeof v === 'string') type = 'str';
            else if (Array.isArray(v)) type = 'list';
            else if (v && typeof v === 'object') type = 'dict';
            f.variables[k] = { type, value: v };
          }
        }

        if (i > 0) {
          if (result.frames[i - 1].dataStructureState) {
            if (!f.dataStructureState) f.dataStructureState = {};
            const prevDS = result.frames[i - 1].dataStructureState;
            for (const key of Object.keys(prevDS)) {
              if (!(key in f.dataStructureState)) f.dataStructureState[key] = JSON.parse(JSON.stringify(prevDS[key]));
              else if (key === 'pointers' && typeof f.dataStructureState.pointers === 'object' && typeof prevDS.pointers === 'object') {
                f.dataStructureState.pointers = { ...prevDS.pointers, ...f.dataStructureState.pointers };
              } else if (key === 'nodes' && Array.isArray(f.dataStructureState.nodes) && Array.isArray(prevDS.nodes)) {
                const newNodesMap = new Map();
                f.dataStructureState.nodes.forEach(n => { if (n && n.id !== undefined) newNodesMap.set(n.id, n); });
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
                  newNodesMap.forEach(n => { if (!n._delete) mergedNodes.push(n); });
                  f.dataStructureState.nodes = mergedNodes;
                }
              }
            }
          }

          if (result.frames[i - 1].recursionTree) {
            if (!f.recursionTree) f.recursionTree = {};
            const prevRT = result.frames[i - 1].recursionTree;
            for (const key of Object.keys(prevRT)) {
              if (!(key in f.recursionTree)) f.recursionTree[key] = JSON.parse(JSON.stringify(prevRT[key]));
              else if (key === 'nodes' && Array.isArray(f.recursionTree.nodes) && Array.isArray(prevRT.nodes)) {
                const newNodesMap = new Map();
                f.recursionTree.nodes.forEach(n => { if (n && n.id !== undefined) newNodesMap.set(n.id, n); });
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
                  newNodesMap.forEach(n => { if (!n._delete) mergedNodes.push(n); });
                  f.recursionTree.nodes = mergedNodes;
                }
              }
            }
          }

          const prevVars = result.frames[i - 1].variables || {};
          for (const k of Object.keys(prevVars)) {
            if (!(k in f.variables)) f.variables[k] = JSON.parse(JSON.stringify(prevVars[k]));
            else if (typeof f.variables[k] === 'object' && typeof prevVars[k] === 'object') {
              f.variables[k] = { ...prevVars[k], ...f.variables[k] };
            }
          }
        }

        if (i > 0) {
          const prevVars = result.frames[i - 1].variables || {};
          for (const [k, v] of Object.entries(f.variables)) {
            v.prevValue = prevVars[k] ? prevVars[k].value : undefined;
            v.changedThisFrame = JSON.stringify(v.value) !== JSON.stringify(v.prevValue);
          }
        } else {
          for (const v of Object.values(f.variables)) v.changedThisFrame = true;
        }
      });

      if (startFrame) {
        result.frames.shift();
      }
    }

    return { success: true, frames: result.frames || [], tokenUsage: tokenUsage };

  } catch (error) {
    console.error("Expand Trace error:", error);
    return { success: false, error: error.message, frames: [] };
  }
}

module.exports = {
  getTrace,
  expandTrace
};
