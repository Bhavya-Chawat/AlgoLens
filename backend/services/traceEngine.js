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
      
      let extraClasses = "";
      if (code.includes("TreeNode") && !code.match(/^class TreeNode/m)) {
        extraClasses += `
class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}
`;
      }
      if (code.includes("ListNode") && !code.match(/^class ListNode/m)) {
        extraClasses += `
class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
`;
      }

      const traceCollectorCode = `
class TraceCollector {
    public static Object globalTree = null;
    private StringBuilder sb = new StringBuilder();
    private boolean first = true;
    public TraceCollector() { sb.append("{\\"frames\\":["); }
    public void addFrame(int line, String event, String codeWithValues, String explanation, String variablesJson, String dsStateJson) {
        if (!first) sb.append(",");
        first = false;
        String vars = variablesJson != null && !variablesJson.isEmpty() ? variablesJson : "{}";
        if (globalTree != null) {
            if (vars.equals("{}")) {
                vars = "{\\"fullTree\\":" + toJson(globalTree) + "}";
            } else {
                vars = vars.substring(0, vars.length() - 1) + ",\\"fullTree\\":" + toJson(globalTree) + "}";
            }
        }
        sb.append("{")
          .append("\\"line\\":").append(line).append(",")
          .append("\\"event\\":\\"").append(event).append("\\",")
          .append("\\"codeWithValues\\":").append(escape(codeWithValues)).append(",")
          .append("\\"explanation\\":").append(escape(explanation)).append(",")
          .append("\\"variables\\":").append(vars).append(",")
          .append("\\"dataStructureState\\":").append(dsStateJson != null && !dsStateJson.isEmpty() ? dsStateJson : "{}").append(",")
          .append("\\"callStack\\":").append(getCallStack())
          .append("}");
    }
    public void print(String resultStr) {
        sb.append("],\\"result\\":").append(resultStr != null ? escape(resultStr) : "null").append("}");
        System.out.println(sb.toString());
    }
    public String escape(String s) {
        if (s == null) return "null";
        return "\\"" + s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n") + "\\"";
    }
    public String getCallStack() {
        StackTraceElement[] st = Thread.currentThread().getStackTrace();
        StringBuilder cs = new StringBuilder("[");
        boolean cFirst = true;
        for (int i = st.length - 1; i >= 0; i--) {
            String name = st[i].getMethodName();
            if (name.equals("getStackTrace") || name.equals("getCallStack") || name.equals("addFrame") || name.equals("main") || name.equals("invoke0") || name.startsWith("access$")) continue;
            if (!cFirst) cs.append(",");
            cFirst = false;
            cs.append("{\\"name\\":\\"").append(name).append("\\"}");
        }
        return cs.append("]").toString();
    }
    public String toJson(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof String) return escape((String)obj);
        if (obj instanceof Number || obj instanceof Boolean) return obj.toString();
        if (obj instanceof int[]) {
            int[] arr = (int[])obj;
            StringBuilder asb = new StringBuilder("[");
            for(int i=0; i<arr.length; i++) { asb.append(arr[i]); if(i<arr.length-1) asb.append(","); }
            return asb.append("]").toString();
        }
        if (obj.getClass().isArray()) {
            Object[] arr = (Object[])obj;
            StringBuilder asb = new StringBuilder("[");
            for(int i=0; i<arr.length; i++) { asb.append(toJson(arr[i])); if(i<arr.length-1) asb.append(","); }
            return asb.append("]").toString();
        }
        ${code.includes('TreeNode') ? `
        if (obj instanceof TreeNode) {
            TreeNode n = (TreeNode)obj;
            return "{\\"val\\":" + n.val + ",\\"left\\":" + toJson(n.left) + ",\\"right\\":" + toJson(n.right) + "}";
        }
        ` : ''}
        ${code.includes('ListNode') ? `
        if (obj instanceof ListNode) {
            ListNode n = (ListNode)obj;
            return "{\\"val\\":" + n.val + ",\\"next\\":" + toJson(n.next) + "}";
        }
        ` : ''}
        return escape(obj.toString());
    }
}
`;
      driver = `\n\n// AUTO-GENERATED DRIVER\n${extraClasses}\n${traceCollectorCode}\npublic class Main {\n    public static void main(String[] args) {\n        Solution sol = new Solution();\n        Object result = sol.${methodName}(${args});\n        System.out.println(result);\n    }\n}\n`;
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

const { executeInstrumentedCode } = require('./sandbox');

/**
 * Uses Groq LLM to instrument the code with a TraceCollector, then executes it securely to capture the trace.
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

  const systemPrompt = `You are an expert AI code instrumenter. Your job is to rewrite the provided ${language} code so that it outputs a JSON trace of its execution to standard output.

PRIORITY LANGUAGE: Java is the primary priority, but you must output valid code in the requested language: ${language}.

CRITICAL INSTRUCTIONS:
1. DO NOT HALLUCINATE A TRACE YOURSELF. You must output the fully runnable, instrumented ${language} code.
2. The instrumented code MUST capture the state and print it as a JSON string to STDOUT using a TraceCollector mechanism at the very end of the execution.
3. STRICT SMART SAMPLING (MAX 50 FRAMES):
   - For recursive algorithms (like DFS/Trees), EVERY function call entry, important branch, and return is significant and MUST be traced!
   - For iterative algorithms, emit a trace frame when a HIGHLY significant event occurs (swap, new max, pointer finalized). Aggressively skip trivial \`i++\` iterations.
   - Limit the total frames collected to 50 max (e.g. \`if (frameCount > 50) return;\`).
4. DATA STRUCTURE TYPE OVERRIDES: Set 'dataStructureState.type' to one of the rich visualizers if applicable:
   - 'sorting_bar_chart' (for array sorts)
   - 'divide_and_conquer' (for merge/quick sort)
   - 'chessboard' (for backtracking grids)
   - 'dp_table' (for DP 2D arrays)
   - 'string_matcher' (for KMP/pointers on strings)
   - 'interval' (for merging intervals)
   - 'trie' (for n-ary string trees)
   Otherwise use generic ones ('array', 'hashmap', 'tree', 'graph', 'linked_list', etc).
5. The final printed output of your script MUST be a valid JSON object matching this exact schema:
   {
     "frames": [
       {
         "line": <number>,
         "event": "assignment|comparison|swap|function_call|return|base_case",
         "codeWithValues": "e.g., if (nums[1] < 9)",
         "explanation": "Human readable (<10 words)",
         "variables": { "varName": <value> }, // Include ALL relevant variables
         "dataStructureState": {
           "type": "<type_from_step_4>",
           "name": "<name_of_main_var>",
           "pointers": { "left": 0, "i": 1 }
         }
       }
     ],
     "result": <final_return_value_or_string>
   }
6. WRAP YOUR ENTIRE OUTPUT IN \`\`\`${language} ... \`\`\`
7. Ensure the code is completely self-contained and runs without syntax errors. For Java, it MUST be a valid \`Main\` class with a \`public static void main(String[] args)\` method. 
8. JSON GENERATION & FULL DATA STRUCTURES:
   - For Java, a \`TraceCollector\` class is already injected into the driver. Initialize it (\`static TraceCollector tc = new TraceCollector();\`).
   - You MUST use \`tc.toJson(varName)\` to serialize any objects or arrays (like TreeNode, int[]). Example: \`"{\\"root\\":" + tc.toJson(root) + "}"\`.
   - CRITICAL FOR TREES/LISTS: You MUST assign the constructed root to \`TraceCollector.globalTree\` inside \`main()\` BEFORE calling the solution method (e.g. \`TraceCollector.globalTree = root;\`).

EXAMPLE INSTRUMENTATION FOR TREES:
\`\`\`java
public class Main {
    static TraceCollector tc = new TraceCollector();
    public static void main(String[] args) {
        TreeNode root = new TreeNode(3, new TreeNode(9), null);
        TraceCollector.globalTree = root; // CRITICAL!
        Solution sol = new Solution();
        tc.print(String.valueOf(sol.maxDepth(root)));
    }
}
class Solution {
    public int maxDepth(TreeNode root) {
        tc.addFrame(12, "function_call", "maxDepth(" + (root==null?"null":root.val) + ")", "Entering maxDepth", "{\\"root\\":"+tc.toJson(root)+"}", "{\\"type\\":\\"tree\\"}");
        if (root == null) {
            tc.addFrame(13, "base_case", "if (root == null)", "Hit base case", "{\\"root\\":null}", "{\\"type\\":\\"tree\\"}");
            return 0;
        }
        int left = maxDepth(root.left);
        tc.addFrame(16, "assignment", "left = " + left, "Computed left depth", "{\\"root\\":"+tc.toJson(root)+",\\"left\\":"+left+"}", "{\\"type\\":\\"tree\\"}");
        return 1 + left;
    }
}
\`\`\`
`;

  try {
    const userMessage = `Test Input: ${JSON.stringify(testInput)}\n\nUser Code:\n${runnableCode}\n\nPlease instrument this code to print the JSON trace to stdout. ONLY RETURN CODE.`;

    console.log("[TraceEngine] Prompting LLM for instrumentation...");
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 4000
    });

    console.log(`[TraceEngine] Token Usage: ${JSON.stringify(completion.usage)}`);

    let responseContent = completion.choices[0]?.message?.content || "";
    
    // Extract code block
    let instrumentedCode = responseContent;
    const codeMatch = responseContent.match(/```(?:java|python|javascript|cpp|c\+\+|js|py)?\s*([\s\S]*?)\s*```/);
    if (codeMatch) {
      instrumentedCode = codeMatch[1];
    } else if (language.includes('java') && responseContent.includes("public class Main")) {
      // Fallback extraction for Java if markdown tags missing
      const firstClass = responseContent.indexOf("public class Main");
      const lastBrace = responseContent.lastIndexOf("}");
      if (firstClass !== -1 && lastBrace !== -1) {
        instrumentedCode = responseContent.substring(firstClass, lastBrace + 1);
      }
    }

    console.log("[TraceEngine] Generated instrumented code. Executing in sandbox...");
    
    // Execute the instrumented code securely
    const execResult = await executeInstrumentedCode(language, instrumentedCode, 2000, judge0ApiKey);
    
    if (!execResult.success) {
       console.error("[TraceEngine] Sandbox Execution Failed:", execResult.error);
       return { success: false, error: execResult.isTLE ? 'Time Limit Exceeded (Execution took too long or got stuck in infinite loop).' : `Execution Error: ${execResult.error}`, frames: [], isTLE: execResult.isTLE };
    }

    let jsonStr = execResult.output;
    
    // Try to extract the JSON block if the program printed other debug stuff
    const jsonBlockMatch = execResult.output.match(/\{[\s\S]*"frames"\s*:[\s\S]*\}/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[0];
    } else {
        const firstBrace = execResult.output.indexOf('{');
        const lastBrace = execResult.output.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = execResult.output.substring(firstBrace, lastBrace + 1);
        }
    }

    jsonStr = jsonStr.trim();
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse stdout JSON trace:", parseError, "Raw string was:", jsonStr.substring(0, 100) + "...");
      return { frames: [], error: "Instrumented code did not output valid JSON. It may have crashed or printed arbitrary text.", rawOutput: execResult.output };
    }

    // Add IDs and cleanup frames
    if (result.frames && Array.isArray(result.frames)) {
      result.frames.forEach((f, i) => {
        if (f.c !== undefined) { f.codeWithValues = f.c; delete f.c; }
        if (f.e !== undefined) { f.explanation = f.e; delete f.e; }
        if (f.v !== undefined) { f.variables = f.v; delete f.v; }
        if (f.d !== undefined) { f.dataStructureState = f.d; delete f.d; }
        
        if (f.dataStructureState) {
          let d = f.dataStructureState;
          if (d.t !== undefined) { d.type = d.t; delete d.t; }
          if (d.n !== undefined) { d.name = d.n; delete d.n; }
          if (d.p !== undefined) { d.pointers = d.p; delete d.p; }
        }

        f.id = i;
        if (!f.variables) f.variables = {};

        // Auto-infer primitive variables formatting for the frontend
        for (const [k, v] of Object.entries(f.variables)) {
          if (v !== null && typeof v === 'object' && 'value' in v) {
            continue; 
          }
          let type = 'generic';
          if (typeof v === 'number') type = 'int';
          else if (typeof v === 'boolean') type = 'bool';
          else if (typeof v === 'string') type = 'str';
          else if (Array.isArray(v)) type = 'list';
          else if (v && typeof v === 'object') type = 'dict';
          f.variables[k] = { type, value: v };
        }

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
      error: error.message || "Failed to instrument and execute trace",
      frames: []
    };
  }
}

module.exports = {
  getTrace
};
