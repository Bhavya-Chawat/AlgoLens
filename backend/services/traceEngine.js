const Groq = require('groq-sdk');
const { analyzeCode } = require('./analyzerService');
const { buildPrompt } = require('./promptModules');

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

  const analysis = await analyzeCode(language, code, effectiveKey);
  const systemPrompt = buildPrompt(analysis, language, runnableCode, testInput, buildTreeHint);

  try {
    const systemMessage = systemPrompt.split("Test Input:")[0];
    const userMessage = "Test Input:" + systemPrompt.split("Test Input:")[1];

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
              const curVal = f.variables[k].value;
              const prevVal = prevVars[k].value;

              if (curVal && typeof curVal === 'object' && !Array.isArray(curVal) && ('_add' in curVal || '_remove' in curVal || '_set' in curVal)) {
                let newVal = Array.isArray(prevVal) ? [...prevVal] : (typeof prevVal === 'object' && prevVal !== null ? {...prevVal} : prevVal);

                if ('_remove' in curVal && Array.isArray(curVal._remove)) {
                  curVal._remove.forEach(item => {
                    if (Array.isArray(newVal)) {
                      const idx = newVal.indexOf(item);
                      if (idx > -1) newVal.splice(idx, 1);
                    } else if (typeof newVal === 'object') {
                      delete newVal[item];
                    }
                  });
                }
                
                if ('_add' in curVal && Array.isArray(curVal._add)) {
                  if (Array.isArray(newVal)) newVal.push(...curVal._add);
                }
                
                if ('_set' in curVal && typeof curVal._set === 'object') {
                  for (const [sKey, sVal] of Object.entries(curVal._set)) {
                    if (Array.isArray(newVal)) {
                      newVal[parseInt(sKey)] = sVal;
                    } else if (typeof newVal === 'object') {
                      newVal[sKey] = sVal;
                    }
                  }
                }
                f.variables[k] = { ...prevVars[k], value: newVal };
              } else {
                f.variables[k] = { ...prevVars[k], ...f.variables[k] };
              }
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
      result: result.result,
      algorithmName: result.algorithmName || null,
      isSummarized: result.isSummarized || false
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

const cleanFrame = (f) => {
  if (!f) return null;
  const cleaned = { line: f.line, event: f.event, c: f.codeWithValues, e: f.explanation, v: {}, d: {} };
  if (f.variables) {
    for (const [k, v] of Object.entries(f.variables)) {
      if (k !== 'skippedNext') cleaned.v[k] = v.value;
    }
  }
  if (f.dataStructureState) {
    cleaned.d.t = f.dataStructureState.type;
    cleaned.d.n = f.dataStructureState.name;
    if (f.dataStructureState.pointers) cleaned.d.p = f.dataStructureState.pointers;
    if (f.dataStructureState.window) cleaned.d.w = f.dataStructureState.window;
  }
  if (Object.keys(cleaned.d).length === 0) delete cleaned.d;
  if (Object.keys(cleaned.v).length === 0) delete cleaned.v;
  return cleaned;
};

const cleanStart = cleanFrame(startFrame);
const cleanEnd = cleanFrame(endFrame);

  const systemPrompt = `You are a strict code visualizer. Mentally execute the ${language} code and output a JSON trace. NO markdown outside JSON.

CRITICAL INSTRUCTIONS:
1. TARGETED EXPANSION: The user has requested to dig deeper between State A and State B. You must output the missing intermediate state changes strictly between these two states. Even if the missing steps are repetitive loops or recursive calls, you MUST output them so the user can see the changing variable states! ONLY refuse (by outputting '{"frames": []}') if State B immediately follows State A in execution with absolutely NO skipped lines.
2. START & END BOUNDARIES: Start generating frames immediately AFTER State A. Stop generating frames immediately BEFORE State B. 
3. RECURSIVE EXPAND & FRAME LIMIT: DO NOT generate more than 10 frames. If there are more than 10 missing steps, YOU MUST SUMMARIZE. Pick the most important 5 to 10 intermediate frames.
4. ONLY ONE GAP ALLOWED: If you summarize, you MUST add '"skippedNext": true' to ONLY ONE frame (the exact frame immediately BEFORE the gap). DO NOT add 'skippedNext' to every frame! This allows the user to expand again recursively.
5. GRANULARITY: Provide the missing loop iterations or recursive calls, but do NOT break them down into microscopic steps. Combine related operations (e.g., 'set.remove()' and 'left++') into a single frame per conceptual step, exactly like the high-level trace does. Do not clutter the timeline with isolated trivial micro-frames.
6. 'dataStructureState': MUST use a non-generic type if a primary structure exists. Forbidden to use "type": "generic" if there is a structure.
7. 'codeWithValues' (CRITICAL): You MUST substitute the actual variable values directly into the code snippet! DO NOT just output the raw code. (e.g., output 'Math.max(3, 7 - 0 + 1)' instead of 'Math.max(maxLength, right - left + 1)').
8. 'explanation': Extremely concise (< 10 words).
9. 'event': MUST be one of function_call | loop_iteration | comparison | assignment | return | branch_true | branch_false | swap | recurse | base_case.
10. DIFF-ONLY OUTPUT (CRITICAL):
   - FRAME 0 MUST INCLUDE ALL VARIABLES: You MUST output the full string/array and any sets/maps in 'v' in the very first frame!
   - AFTER FRAME 0, NEVER REPEAT UNCHANGED DATA.
   - SMART DELTAS FOR COLLECTIONS: NEVER output full arrays/sets/maps after Frame 0! Use {"_add": ["c"]}, {"_remove": ["a"]}, or {"_set": {"idx": 2}}.
   - CALL STACK ('cs'): OMIT ENTIRELY unless the algorithm is recursive. Do not output 'cs' for simple loops.
   
10. BRIEF SCRATCHPAD ALLOWED:
    You MUST write a 1-2 line <scratchpad> to trace the recursive math and call stack so you don't hallucinate!

11. STRICT JSON FORMATTING (CRITICAL):
    - JSON values MUST be wrapped in double quotes. If you need quotes INSIDE a string, use single quotes (e.g. "c": "set.add('a')").
    - NO unescaped newlines (\n) inside string values.
    - NO JS-only types like undefined, NaN, Infinity. Use null or strings instead.

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
${JSON.stringify(cleanStart)}

State B (End Point):
${JSON.stringify(cleanEnd)}`;

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
