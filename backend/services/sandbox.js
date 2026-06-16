const { executeLocally } = require('./localSandbox');

/**
 * Routes execution between Judge0 (for web deployments) and Native Local Execution (for desktop/testing).
 */
async function executeInstrumentedCode(language, code, timeoutMs = 2000, judge0ApiKey = null) {
    // If Judge0 API key is present, route to Judge0 for secure remote execution
    if (judge0ApiKey && judge0ApiKey.trim() !== '') {
        console.log("[Sandbox] Judge0 Key provided. Executing via Judge0 API...");
        try {
            // Using native fetch to avoid external dependencies
            const langMap = {
                'java': 62,
                'python': 71,
                'javascript': 63,
                'cpp': 54
            };
            
            const response = await fetch('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-host': 'judge0-ce.p.rapidapi.com',
                    'x-rapidapi-key': judge0ApiKey
                },
                body: JSON.stringify({
                    source_code: code,
                    language_id: langMap[language] || 62,
                    cpu_time_limit: timeoutMs / 1000
                })
            });

            const data = await response.json();
            if (data.status && data.status.id === 3) {
                return { success: true, output: data.stdout };
            } else if (data.status && data.status.id === 5) {
                return { success: false, error: 'Time Limit Exceeded', isTLE: true };
            } else {
                return { success: false, error: data.stderr || data.compile_output || data.message || "Judge0 Error" };
            }
        } catch (error) {
            console.error("[Sandbox] Judge0 execution failed. Falling back to Local Execution...", error.message);
        }
    }
    
    // Fallback or Desktop Local Execution
    try {
        console.log(`[Sandbox] Executing ${language} code natively on local host...`);
        const stdout = await executeLocally(language, code, timeoutMs);
        return { success: true, output: stdout };
    } catch (error) {
        if (error.message.includes('Time Limit Exceeded') || error.message.includes('killed')) {
            return { success: false, error: 'Time Limit Exceeded', isTLE: true };
        }
        return { success: false, error: error.message };
    }
}

module.exports = { executeInstrumentedCode };
