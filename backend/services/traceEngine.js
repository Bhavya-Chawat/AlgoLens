const Groq = require('groq-sdk');

function generateDriver(language, code, testInput) {
  let driver = '';
  let methodName = '';
  const lang = (language || '').toLowerCase();
  
  if (lang.includes('python')) {
    const match = code.match(/def\s+([a-zA-Z_]\w*)\s*\(\s*self/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = Array.isArray(testInput) ? testInput.map(i => JSON.stringify(i)).join(', ') : JSON.stringify(testInput);
      driver = `\n\n# AUTO-GENERATED DRIVER\nsol = Solution()\nresult = sol.${methodName}(${args})\nprint(result)\n`;
    }
  } else if (lang.includes('java') && !lang.includes('javascript')) {
    const match = code.match(/class\s+Solution\s*\{[\s\S]*?(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>,\s\[\]]+)\s+([a-zA-Z_]\w*)\s*\(/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = Array.isArray(testInput) ? testInput.map(i => JSON.stringify(i).replace(/\[/g, '{').replace(/\]/g, '}')).join(', ') : JSON.stringify(testInput);
      driver = `\n\n// AUTO-GENERATED DRIVER\npublic class Main {\n    public static void main(String[] args) {\n        Solution sol = new Solution();\n        Object result = sol.${methodName}(${args});\n        System.out.println(result);\n    }\n}\n`;
    }
  } else if (lang.includes('cpp') || lang.includes('c++') || lang.includes('c_cpp')) {
    const match = code.match(/class\s+Solution\s*\{[\s\S]*?public:\s*(?:[\w<>,\s\[\]\*\&]+)\s+([a-zA-Z_]\w*)\s*\(/);
    if (match) methodName = match[1];
    if (methodName) {
      const args = Array.isArray(testInput) ? testInput.map(i => JSON.stringify(i).replace(/\[/g, '{').replace(/\]/g, '}')).join(', ') : JSON.stringify(testInput);
      driver = `\n\n// AUTO-GENERATED DRIVER\nint main() {\n    Solution sol;\n    auto result = sol.${methodName}(${args});\n    return 0;\n}\n`;
    }
  } else if (lang.includes('javascript') || lang.includes('js') || lang.includes('typescript') || lang.includes('ts')) {
    const matchVar = code.match(/(?:var|let|const)\s+([a-zA-Z_]\w*)\s*=\s*function/);
    if (matchVar) {
      methodName = matchVar[1];
      const args = Array.isArray(testInput) ? testInput.map(i => JSON.stringify(i)).join(', ') : JSON.stringify(testInput);
      driver = `\n\n// AUTO-GENERATED DRIVER\nconst result = ${methodName}(${args});\nconsole.log(result);\n`;
    } else {
      const matchClass = code.match(/class\s+Solution\s*\{[\s\S]*?([a-zA-Z_]\w*)\s*\(/);
      if (matchClass) {
        methodName = matchClass[1];
        const args = Array.isArray(testInput) ? testInput.map(i => JSON.stringify(i)).join(', ') : JSON.stringify(testInput);
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
1. Every loop iteration MUST be its own frame. Never skip iterations unless the loop runs more than 30 times — only then summarize the middle, but always show the first 3 and last 3 iterations.
2. Every frame MUST have 'dataStructureState' with a non-generic type if a primary structure exists. Forbidden to use "type": "generic" unless the code literally has no recognizable data structure.
3. 'codeWithValues' is mandatory every frame. Replace every variable in the executing line with its actual current value (e.g., 'if nums[1] < 9' instead of 'if nums[i] < target').
4. 'explanation' must be human-readable and specific (e.g., "Checking if nums[1] (value 7) is less than target (9) — it is, so we continue.").
5. 'variables' must include EVERY variable in scope, not just the ones that changed. Always include the main input array/structure in full so the frontend can render it.
6. The 'event' field MUST be exactly one of: function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
7. Output the COMPLETE trace until the function fully finishes returning. DO NOT STOP EARLY. If the function is recursive, trace the entire call tree until the root returns.
8. ABSOLUTELY DO NOT GET LAZY. You MUST output every single frame until the algorithm terminates completely. Do NOT close the JSON array early just because it is getting long.
9. TOKEN LIMIT OPTIMIZATION (CRITICAL):
   - OMIT 'dataStructureState' completely from the frame if it has NOT changed since the previous frame.
   - OMIT 'recursionTree' completely from the frame if the call stack has NOT changed.
   - OMIT the full tree/graph object from the 'variables' dictionary. Only include primitives (int, bool, string) and small arrays. The backend will automatically carry over unchanged states.

10. CHAIN OF THOUGHT (CRITICAL):
    Before outputting the JSON, you MUST write a '<scratchpad>' block where you carefully simulate the execution step-by-step. Keep track of the call stack, variables, and return values mentally. This will prevent you from making mistakes or stopping early.
    Format:
    <scratchpad>
    Step 1: maxDepth(root=3) called.
    Step 2: left = maxDepth(9) called...
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

STRUCTURE DETECTION RULES:
- array: populate pointers with every index variable (i, j, left, right, etc.) and highlights with currently accessed indices.
- sliding_window: always include window: [left, right]
- hashmap: include current key-value state
- set: output the set contents as a flat array (e.g. ["a", "b", "c"]) and use type "set"
- binary_tree: ALWAYS include recursionTree with nodes[] showing the full call stack as a tree, updating every frame, and include full nodes[] every frame with highlight: "active|visited|none"
- linked_list: include nodes[] with id, val, next, highlight, label
- stack/queue: include array showing current contents

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
      if (fallbackMatch) jsonStr = fallbackMatch[0];
    }
    
    const result = JSON.parse(jsonStr);
    
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
