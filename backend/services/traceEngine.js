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

  const systemPrompt = `You are a strict code interpreter and visualizer.
Your task is to mentally execute the user's ${language} code step-by-step on the provided test input and output a detailed JSON trace of the execution.
Do NOT output any markdown, explanations, or code blocks outside of the JSON. ONLY valid JSON.

CRITICAL INSTRUCTIONS:
1. KEY-STEP DEBUGGING: Do NOT output a frame for every single line of code. A human user does not want to click through 50 repetitive steps. Group mundane operations (like a simple condition check + assignment) into a single logical "Key-Step" frame.
2. SKIP INITIALIZATION: Do NOT output frames for trivial variable declarations or empty data structure initializations (e.g., \`left = 0\`, \`maxLen = 0\`, \`set = new HashSet()\`). Skip straight to the first meaningful step where logic actually begins (e.g., the first iteration of the main loop).
3. MAXIMUM FRAME LIMIT: You MUST output a MAXIMUM of 25 frames for the entire execution. If an algorithm loops many times, aggressively SKIP the repetitive middle iterations. Only show the most important algorithmic milestones (e.g., window expanding, duplicate found, target matched, base case reached).
4. Every frame MUST have 'dataStructureState' with a non-generic type if a primary structure exists. Forbidden to use "type": "generic" unless the code literally has no recognizable data structure.
5. 'codeWithValues' is mandatory every frame. If you grouped multiple lines, put the most important line here (e.g., 'if nums[1] < 9' or 'maxLen = 3').
5. 'explanation' must be extremely concise (under 10 words) to save tokens (e.g., "nums[1] < target, continuing").
6. 'variables' must include EVERY variable in scope, not just the ones that changed. Always include the main input array/structure in full so the frontend can render it.
7. The 'event' field MUST be exactly one of: function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
9. TOKEN LIMIT OPTIMIZATION (CRITICAL):
   - OMIT 'dataStructureState' completely from the frame if it has NOT changed since the previous frame.
   - OMIT 'recursionTree' completely from the frame if the call stack has NOT changed.
   - OMIT the full tree/graph object from the 'variables' dictionary. Only include primitives (int, bool, string) and small arrays.
   - OMIT any variable from 'variables' if its value has NOT changed since the previous frame. Only include variables that changed or are new. The backend will automatically carry them over.

10. CHAIN OF THOUGHT (CRITICAL BUT CONCISE):
    Write a VERY BRIEF '<scratchpad>' block to trace the state. Do NOT write long sentences in the scratchpad. Keep it to a few words per step to save output tokens.
    Format:
    <scratchpad>
    S1: maxDepth(3)
    S2: left=maxDepth(9)
    ...
    </scratchpad>
    \`\`\`json
    { ... }
    \`\`\`

11. RETURN VALUE RULE:
    The 'returnValue' field in your JSON MUST ONLY contain the exact primitive value (e.g., "0", "1", "[1, 2]", "true"). DO NOT write sentences like "Returning 0 because...".

12. LEETCODE ARRAY REPRESENTATION:
    If the test input is an array representing a Binary Tree (e.g., [3, 9, 20, null, null, 15, 7]), it is in level-order (BFS). 
    - The root is at index 0.
    - The left child of node at index i is at 2*i + 1.
    - The right child of node at index i is at 2*i + 2.
    - 'null' means the child doesn't exist. You MUST correctly mentally build this tree before tracing! Do NOT hallucinate nulls. Node 7 in [3,9,20,null,null,15,7] is a VALID node, not null!

13. DATA STRUCTURE TAXONOMY & ENFORCED TYPES (CRITICAL):
    You MUST output EXACTLY ONE of these types as the primary 'dataStructureState.type'. Include auxiliary data in 'variables'.
    - array: 1D arrays, strings. Include pointers as integer variables.
    - matrix: 2D grids, boards.
    - sliding_window: Include 'window: [left, right]' in pointers if applicable.
    - two_pointers: Standard array/string but explicitly flagged.
    - hashmap: Include key-value state.
    - set: Output contents as a flat array (e.g. ["a", "b", "c"]).
    - stack: Output as array. Note if monotonic.
    - queue: Output as array. Note if monotonic.
    - priority_queue: ALWAYS output as a flat 0-indexed array (heap representation), NEVER as pointer/node objects.
    - linked_list: Output nodes[] with id, val, next, highlight, label.
    - binary_tree: Output nodes[] array.
    - graph: Adjacency list. Include 'directed' and 'weighted' boolean flags in variables if applicable.
    - trie: ALWAYS output as a nested dictionary, NEVER as node arrays.
    - union_find: Output 'parent' and 'rank' arrays.
    - interval: Output as 2D array of [start, end].
    - segment_tree: ALWAYS output as a flat 0-indexed array. NEVER output as pointer/node objects.
    - fenwick_tree: Output as flat array (1-indexed but JS arrays are 0-indexed).
    - bitwise: Output variables as raw integers, the frontend will render the bits.
    - recursion: Backtracking where state is implicit in call stack.
    - generic: Fallback.

14. DP METADATA:
    If a cell in an array/matrix is derived from previous cells (DP), include a 'dp_derivation: [source_index_1, source_index_2]' in the frame if possible.

15. JSON STRING ESCAPING (CRITICAL):
    Whenever you include code snippets, characters, or string values in 'codeWithValues' or 'explanation', you MUST either use single quotes (e.g. 'a') OR properly escape double quotes (e.g. \\"a\\"). NEVER use unescaped double quotes inside a JSON string value.

JSON SCHEMA TO FOLLOW EXACTLY:
{
  "metadata": {
    "algorithm": "Name of algorithm used (e.g., Two Pointer, DFS)",
    "dataStructure": "Main DS used",
    "timeComplexity": "O(?)",
    "spaceComplexity": "O(?)"
  },
  "frames": [
    {
      "line": <line number currently executing>,
      "event": "<function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case>",
      "codeWithValues": "string showing the code line with variables replaced by values",
      "explanation": "Human-readable specific explanation of what this line is doing right now",
      "variables": {
        "varName": { "type": "int|str|bool|list|dict|TreeNode|ListNode", "value": <actual value or object> }
      },
      "dataStructureState": {
        "type": "array|binary_tree|graph|linked_list|stack|queue|hashmap|sliding_window|bitwise|generic",
        "name": "nums", // Name of the primary variable being visualized
        
        // IF ARRAY or SLIDING_WINDOW:
        "pointers": {"i": 0, "left": 0, "right": 3}, // named indices
        "window": [0, 3], // start and end index (inclusive) if sliding window
        "highlights": [0, 3], // indices that changed or are being compared
        
        // IF LINKED_LIST or TREE or GRAPH:
        "nodes": [
          {"id": 0, "val": 3, "left": 1, "right": 2, "next": 1, "highlight": "active|visited|none", "label": "curr"}
        ]
      },
      // IF RECURSIVE (MUST include for recursive functions):
      "recursionTree": {
        "nodes": [
          {"id": 0, "label": "funcName(args)", "status": "active|waiting|done", "returnValue": "...", "parentId": null}
        ]
      }
    }
  ],
  "result": <final returned value of the function>
}

Test Input: ${JSON.stringify(testInput)}

User Code:
${runnableCode}`;

  try {
    const systemMessage = systemPrompt.split("Test Input:")[0];
    const userMessage = "Test Input:" + systemPrompt.split("Test Input:")[1] + "\n\nCRITICAL: DO NOT SKIP ANY STEPS. DO NOT STOP AT 11 FRAMES. Trace the algorithm all the way back to the root's final return statement.";

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 8192
    });

    let responseContent = completion.choices[0]?.message?.content || "{}";
    
    // DEBUG: Save raw LLM response to disk
    require('fs').writeFileSync('llm_debug_trace.txt', responseContent, 'utf8');

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
      } catch(e) {
        console.error("Failed to parse JSON trace:", parseError, "Raw string was:", jsonStr.substring(0, 100) + "...");
        result = { frames: [], error: "LLM output could not be parsed as valid JSON. It may have exceeded token limits." };
      }
    }
    
    // Add IDs to frames
    if (result.frames && Array.isArray(result.frames)) {
      result.frames.forEach((f, i) => {
        f.id = i;
        if (!f.variables) f.variables = {};
        
        // Carry over data structures if omitted (token optimization)
        if (i > 0) {
          if (!f.dataStructureState && result.frames[i-1].dataStructureState) {
            f.dataStructureState = JSON.parse(JSON.stringify(result.frames[i-1].dataStructureState));
          }
          if (!f.recursionTree && result.frames[i-1].recursionTree) {
            f.recursionTree = JSON.parse(JSON.stringify(result.frames[i-1].recursionTree));
          }
          
          // Carry over missing variables
          const prevVars = result.frames[i-1].variables || {};
          for (const k of Object.keys(prevVars)) {
            if (!(k in f.variables)) {
              f.variables[k] = JSON.parse(JSON.stringify(prevVars[k]));
            }
          }
        }

        // Ensure prevValue exists for inspector
        if (i > 0) {
          const prevVars = result.frames[i-1].variables || {};
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
