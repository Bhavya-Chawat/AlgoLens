export function summarizeTrace(trace, code, testInput, bugs, leetcodeProblem) {
  const summary = {
    language: 'Python/Java/CPP/JS',
    totalFrames: trace.length,
    testInput: testInput || 'None provided',
    actualOutput: null,
    expectedOutput: 'Unknown',
    callStackMaxDepth: 0,
    variableChanges: [],
    suspiciousPatterns: [],
    bugs: [],
    userCode: code || 'Not provided',
    problemContext: leetcodeProblem ? `Title: ${leetcodeProblem.title}\nDescription: ${leetcodeProblem.description}` : 'Not provided'
  };

  if (!trace || trace.length === 0) return summary;

  // 1. Extract Actual Output (if returned from main or printed)
  const finalFrame = trace[trace.length - 1];
  if (finalFrame.eventType === 'return') {
    summary.actualOutput = String(finalFrame.variables?.[finalFrame.returnValue]?.value ?? finalFrame.returnValue ?? 'None');
  }

  // 2. Format Bugs
  summary.bugs = bugs.map(b => `${b.type.replace(/_/g, ' ')}: ${b.description} at frame ${b.frameId}`);

  // 3. Max Recursion Depth
  let maxDepth = 0;
  trace.forEach(f => {
    if (f.callStack && f.callStack.length > maxDepth) {
      maxDepth = f.callStack.length;
    }
  });
  summary.callStackMaxDepth = maxDepth;

  // 4. Summarize Variable Changes
  const varActivity = {};
  trace.forEach(f => {
    if (!f.variables) return;
    Object.entries(f.variables).forEach(([name, info]) => {
      if (!varActivity[name]) {
        varActivity[name] = { changes: 0, finalValue: info.value, type: info.type };
      }
      if (info.changedThisFrame) {
        varActivity[name].changes += 1;
      }
      varActivity[name].finalValue = info.value;
    });
  });

  summary.variableChanges = Object.entries(varActivity)
    .sort((a, b) => b[1].changes - a[1].changes)
    .slice(0, 10)
    .map(([name, data]) => {
      let valStr = String(data.finalValue);
      if (valStr.length > 50) valStr = valStr.slice(0, 47) + '...';
      return `${name} (type ${data.type}): changed ${data.changes} times, final value: ${valStr}`;
    });

  // 5. Loop Iterations (Suspicious Patterns)
  const loopCounts = {};
  trace.forEach((f, i) => {
    if (f.eventType === 'loop_start') {
      const line = f.line;
      loopCounts[line] = (loopCounts[line] || 0) + 1;
    }
  });

  Object.entries(loopCounts).forEach(([line, count]) => {
    if (count > 500) {
      summary.suspiciousPatterns.push(`Loop at line ${line} iterated ${count} times (possible infinite loop).`);
    } else if (count > 50) {
      summary.suspiciousPatterns.push(`Loop at line ${line} iterated ${count} times.`);
    }
  });

  if (summary.suspiciousPatterns.length === 0) {
    summary.suspiciousPatterns.push("None detected.");
  }

  return summary;
}

export function buildPrompt(summary) {
  return `Analyze this execution trace:

LeetCode Problem Context:
${summary.problemContext}

User Code:
${summary.userCode}

Language: ${summary.language}
Test input: ${summary.testInput}
Actual output: ${summary.actualOutput}
Total execution frames: ${summary.totalFrames}

Variable activity:
${summary.variableChanges.join('\n')}

Detected issues:
${summary.bugs.length > 0 ? summary.bugs.join('\n') : 'None'}

Suspicious patterns:
${summary.suspiciousPatterns.join('\n')}

Maximum recursion depth: ${summary.callStackMaxDepth}

Provide a short, concise analysis (max 3-4 sentences). 
CRITICAL RULES FOR ACCURACY:
1. Code Correctness: If the code logic is correct and will pass on LeetCode, state clearly: "Looks good! The code is correct and should pass on LeetCode." Do not invent bugs or hallucinate issues.
2. Efficiency: If the code is correct but inefficient in time or space complexity, briefly comment on how to optimize it (e.g., using a HashSet instead of an Array).
3. Wrong Answers (Subtle Hints): If the code runs but gives a wrong answer or fails edge cases, provide a *subtle hint* stating what might be going wrong. Do NOT provide the exact fix or corrected code immediately. Guide the user to find the bug themselves.
4. No Premature Warnings: Do not flag non-standard variable names, uninitialized strings, or non-linear loop bounds as errors unless they specifically break the algorithm. Keep the hints brief, concise, and highly actionable.`;
}
