const Groq = require('groq-sdk');

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

  const systemPrompt = `You are a strict code interpreter and visualizer.
Your task is to mentally execute the user's ${language} code step-by-step on the provided test input and output a detailed JSON trace of the execution.
Do NOT output any markdown, explanations, or code blocks outside of the JSON. ONLY valid JSON.

CRITICAL INSTRUCTIONS:
1. Limit output to a maximum of 50 frames. If the code has a long loop, skip repetitive iterations in the middle and summarize them, skipping to the final iteration or the point where logic breaks/finishes.
2. If the user's logic is flawed or has an infinite loop, trace up to 50 frames and then stop, accurately showing what their buggy code does.
3. For each step, provide 'codeWithValues' where you plug the actual variable values into the line of code (e.g., 'if (nums[i] < target)' becomes 'if (3 < 10)').
4. Clearly set the 'dataStructureState.type' to one of: 'array', 'binary_tree', 'graph', 'linked_list', 'stack', 'queue', 'hashmap', 'sliding_window', 'bitwise', or 'generic'.
5. CRITICAL: For recursion problems (like DFS/BFS on trees), you MUST ALWAYS provide the 'recursionTree' object in EVERY frame. If it involves a tree, you MUST use 'type': 'binary_tree' and provide the 'nodes' array. Do NOT use 'generic' for trees.

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
      "event": "<function_call | return | assignment | comparison | loop_start | branch | swap | bitwise>",
      "codeWithValues": "string showing the code line with variables replaced by values",
      "explanation": "Short, clear explanation of what this line is doing right now",
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
          {"id": 0, "val": 3, "left": 1, "right": 2, "next": 1, "highlight": "active|visited|none|created|deleted", "label": "head/root/curr"}
        ],

        // IF BITWISE:
        "bits": {
          "num1": "00001010",
          "num2": "00000011",
          "result": "00000010"
        }
      },
      // IF RECURSIVE:
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
${code}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const responseContent = completion.choices[0]?.message?.content || "{}";
    const result = JSON.parse(responseContent);
    
    // Add IDs to frames
    if (result.frames && Array.isArray(result.frames)) {
      result.frames.forEach((f, i) => {
        f.id = i;
        if (!f.variables) f.variables = {};
        
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
