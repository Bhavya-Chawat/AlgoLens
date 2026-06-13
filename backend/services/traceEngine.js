const Groq = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Judge0 language mappings
const JUDGE0_LANGS = {
  java: 91,       // Java 17
  cpp: 54,        // C++ (GCC 9.2.0)
  javascript: 93, // Node 18
  python: 71      // Python 3.8
};

// Local Execution commands mapping
const LOCAL_CMDS = {
  python: { ext: 'py', run: (file) => `python "${file}"` },
  javascript: { ext: 'js', run: (file) => `node "${file}"` },
  java: { 
    ext: 'java', 
    compile: (file) => `javac -cp "${path.join(__dirname, '..', 'lib', 'gson.jar')}" "${file}"`, 
    run: (file, dir) => `java -cp "${dir};${path.join(__dirname, '..', 'lib', 'gson.jar')}" Main` 
  },
  cpp: { 
    ext: 'cpp', 
    compile: (file, out) => `g++ "${file}" -I"${path.join(__dirname, '..', 'include')}" -o "${out}"`, 
    run: (file, dir, out) => `"${out}"` 
  }
};

/**
 * Instruments the user's code via Groq LLM
 */
async function instrumentCode(editorMode, language, code, testInput, apiKey) {
  if (!code || code.trim() === '') {
    throw new Error('Code is empty. Please write some code before executing.');
  }

  const effectiveKey = apiKey || process.env.GROQ_API_KEY;
  if (!effectiveKey) {
    throw new Error("No API key available. Set GROQ_API_KEY in .env or provide a custom key.");
  }
  const groq = new Groq({ apiKey: effectiveKey });

  let systemPrompt = `You are an expert compiler engineer and AST transformer.
Your task is to take the provided ${language} code and rewrite it to output a line-by-line execution trace.
Rules:
1. Inject a print statement immediately after EVERY logical line or variable assignment in the user's code.
2. The print statement MUST output EXACTLY one single line of valid JSON in this format:
   {"line": <current_line_number>, "vars": {"var1": <val>, "var2": <val>}}
3. Do not break the syntax of the program. Ensure all blocks { } remain balanced.`;

  if (editorMode === 'custom') {
    systemPrompt += `\n4. The user has provided custom code that may already contain a main function. DO NOT generate or append a new main function. ONLY instrument the code they provided.`;
  } else {
    systemPrompt += `\n4. You MUST append a main function/execution block that parses this input: ${JSON.stringify(testInput)}, calls the user's function, and prints the final returned result as EXACTLY one line of JSON: {"result": <returned_value>}`;
  }

  systemPrompt += `
5. ONLY OUTPUT THE INSTRUMENTED CODE. Do not include markdown formatting like \`\`\`java. Just the raw code.
6. The output must be ready to compile and run directly. For Java, you MUST NOT include any package declaration, and the main class MUST be named 'Main' and must be 'public'. Keep all other classes non-public.
7. CRITICAL JSON RULES: 
   - Keep the 'vars' object limited to the 5 most recently changed or relevant local variables to avoid size limits.
   - For Python: Use the built-in 'import json' and 'json.dumps()'
   - For JavaScript: Use the built-in 'JSON.stringify()'
   - For Java: You MUST import 'com.google.gson.Gson' and 'java.util.Map'. Do NOT use double-brace initialization (e.g. \`new HashMap<>() {{ put(...); }}\`) because loop variables are not effectively final! Instead, use Java 9+ \`Map.of("line", lineNum, "vars", Map.of("varName", varValue))\` and wrap it in \`new Gson().toJson(...)\` inside your print statement.
   - For C++: You MUST include <json.hpp> (which is nlohmann/json) AND <iostream>. Use nlohmann::json to build and serialize the JSON!
8. CRITICAL RULE: DO NOT fix any missing semicolons, typos, or syntax errors present in the user's logic. If they missed a semicolon, YOU MUST leave it missing in your output so the actual compiler catches it. However, you MUST STILL provide necessary imports (and a main wrapper if instructed above).

User Code:
${code}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
  });

  let instrumented = completion.choices[0]?.message?.content || "";
  if (instrumented.startsWith('\`\`\`')) {
    const lines = instrumented.split('\n');
    lines.shift();
    if (lines[lines.length - 1].startsWith('\`\`\`')) {
      lines.pop();
    }
    instrumented = lines.join('\n');
  }
  return instrumented;
}

/**
 * Executes the code on Judge0
 */
async function executeOnJudge0(language, code, apiKey) {
  const langId = JUDGE0_LANGS[language];
  if (!langId) throw new Error(`Unsupported language for Judge0: ${language}`);

  const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
    },
    body: JSON.stringify({
      language_id: langId,
      source_code: code,
      stdin: ""
    })
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Judge0 API Unauthorized: Please check your RapidAPI Key`);
    }
    throw new Error(`Judge0 API error: ${response.statusText}`);
  }

  const result = await response.json();
  
  return {
    compile: {
      code: result.compile_output ? 1 : 0,
      output: result.compile_output || ""
    },
    run: {
      code: result.status?.id <= 3 ? 0 : 1, // 3 is Accepted
      stdout: result.stdout || "",
      stderr: result.stderr || result.message || ""
    }
  };
}

/**
 * Executes the code locally via child_process
 */
async function executeLocally(language, code) {
  const config = LOCAL_CMDS[language];
  if (!config) throw new Error(`Unsupported language for local execution: ${language}`);

  const tempDir = path.join(__dirname, '..', '.temp');
  await fs.mkdir(tempDir, { recursive: true });

  const fileName = language === 'java' ? 'Main.java' : `temp_${Date.now()}.${config.ext}`;
  const filePath = path.join(tempDir, fileName);
  const outPath = path.join(tempDir, `temp_${Date.now()}.exe`); // For C++
  
  let result = { compile: { code: 0, output: '' }, run: { code: 0, stdout: '', stderr: '' } };

  try {
    await fs.writeFile(filePath, code, 'utf8');

    // Compile step if required
    if (config.compile) {
      try {
        const compileCmd = language === 'cpp' ? config.compile(filePath, outPath) : config.compile(filePath);
        await execPromise(compileCmd);
      } catch (compileErr) {
        result.compile.code = 1;
        result.compile.output = compileErr.stderr || compileErr.message;
        return result;
      }
    }

    // Run step
    try {
      const runCmd = language === 'cpp' ? config.run(filePath, tempDir, outPath) : config.run(filePath, tempDir);
      const { stdout, stderr } = await execPromise(runCmd, { timeout: 10000 }); // 10s timeout
      result.run.stdout = stdout;
      result.run.stderr = stderr;
    } catch (runErr) {
      result.run.code = 1;
      result.run.stdout = runErr.stdout || '';
      result.run.stderr = runErr.stderr || runErr.message;
    }

  } finally {
    // Cleanup
    try {
      await fs.unlink(filePath).catch(()=>null);
      if (language === 'java') await fs.unlink(path.join(tempDir, 'Main.class')).catch(()=>null);
      if (language === 'cpp') await fs.unlink(outPath).catch(()=>null);
    } catch(e) {}
  }

  return result;
}

/**
 * Orchestrates the full tracing flow
 */
async function getTrace(editorMode, language, code, testInput, apiKey, judge0ApiKey) {
  try {
    // 1. Instrument code
    const instrumentedCode = await instrumentCode(editorMode, language, code, testInput, apiKey);
    
    if (instrumentedCode.startsWith('SYNTAX_ERROR:')) {
      return {
        success: false,
        error: instrumentedCode.replace('SYNTAX_ERROR:', 'Compilation Error:').trim(),
        frames: []
      };
    }

    // 2. Determine execution strategy
    const effectiveJudge0Key = judge0ApiKey || process.env.JUDGE0_API_KEY;
    let runResult;

    if (effectiveJudge0Key) {
      console.log('Executing on Judge0 Cloud...');
      try {
        runResult = await executeOnJudge0(language, instrumentedCode, effectiveJudge0Key);
      } catch (err) {
        console.warn('Judge0 execution failed, falling back to Local Execution:', err.message);
        console.log('Executing Locally...');
        runResult = await executeLocally(language, instrumentedCode);
      }
    } else {
      console.log('No Judge0 API Key provided. Executing Locally...');
      runResult = await executeLocally(language, instrumentedCode);
    }
    
    // 3. Check for compilation errors
    if (runResult.compile && runResult.compile.code !== 0) {
      return {
        success: false,
        error: "Compilation Error:\n" + runResult.compile.output,
        frames: []
      };
    }
    
    // 4. Check for runtime errors
    if (runResult.run.code !== 0 && runResult.run.stderr) {
       return {
         success: false,
         error: "Runtime Error:\n" + runResult.run.stderr,
         frames: []
       };
    }

    // 5. Parse stdout to JSON frames
    const stdout = runResult.run.stdout || "";
    const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));
    
    let finalResult = null;
    const rawFrames = [];

    lines.forEach((line) => {
      try {
        const parsed = JSON.parse(line);
        if ('result' in parsed) {
          finalResult = parsed.result;
        } else {
          rawFrames.push({
            line: parsed.line || 1,
            vars: parsed.vars || {},
          });
        }
      } catch (e) {}
    });

    // 6. Normalize into richly-typed TraceFrames for frontend
    const frames = normalizeTrace(rawFrames);

    return {
      success: true,
      frames: frames,
      result: finalResult
    };

  } catch (error) {
    console.error("Tracing error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate trace",
      frames: []
    };
  }
}

/**
 * Infers the JS-friendly type string for a value
 */
function inferType(val) {
  if (val === null || val === undefined) return 'NoneType';
  if (typeof val === 'boolean') return 'bool';
  if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float';
  if (typeof val === 'string') return 'str';
  if (Array.isArray(val)) return 'list';
  if (typeof val === 'object') return 'dict';
  return 'str';
}

/**
 * Converts raw [{line, vars}] into richly-typed TraceFrames
 * that the frontend Visualizer, Inspector, and Timeline expect.
 */
function normalizeTrace(rawFrames) {
  let prevVars = {};

  return rawFrames.map((raw, idx) => {
    const variables = {};

    for (const [name, val] of Object.entries(raw.vars || {})) {
      const type = inferType(val);
      const prevVal = prevVars[name];
      const prevValStr = JSON.stringify(prevVal);
      const currValStr = JSON.stringify(val);
      const changed = prevValStr !== currValStr;

      variables[name] = {
        value: val,
        type: type,
        changedThisFrame: changed,
        prevValue: prevVal !== undefined ? prevVal : null,
      };
    }

    // Also carry forward variables that existed in the previous frame
    // but are not in the current frame (they didn't change)
    for (const [name, val] of Object.entries(prevVars)) {
      if (!(name in variables)) {
        variables[name] = {
          value: val,
          type: inferType(val),
          changedThisFrame: false,
          prevValue: val,
        };
      }
    }

    // Update prevVars for next iteration
    const currentVarValues = {};
    for (const [name, info] of Object.entries(variables)) {
      currentVarValues[name] = info.value;
    }
    prevVars = currentVarValues;

    return {
      id: idx,
      line: raw.line,
      variables: variables,
      callStack: [],
      eventType: 'line',
      description: `Line ${raw.line}`,
      stdout: '',
      isBugFrame: false,
    };
  });
}

module.exports = {
  getTrace
};
