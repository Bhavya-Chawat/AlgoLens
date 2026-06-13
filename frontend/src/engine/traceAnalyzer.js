export function summarizeTrace(trace, code, testInput, bugs) {
  const summary = {
    language: 'Python',
    totalFrames: trace.length,
    testInput: testInput || 'None provided',
    actualOutput: null,
    expectedOutput: 'Unknown',
    callStackMaxDepth: 0,
    variableChanges: [],
    suspiciousPatterns: [],
    bugs: [],
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

Provide your analysis.`;
}
