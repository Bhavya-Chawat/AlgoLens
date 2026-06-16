const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

/**
 * Executes code natively on the host machine.
 * Useful for local testing or Desktop .exe deployments.
 * 
 * @param {string} language 
 * @param {string} code 
 * @param {number} timeoutMs 
 * @returns Promise resolving to stdout
 */
async function executeLocally(language, code, timeoutMs = 2000) {
    const tempId = crypto.randomBytes(16).toString('hex');
    const tempDir = path.join(os.tmpdir(), `algolens_${tempId}`);
    
    await fs.mkdir(tempDir, { recursive: true });

    let cmd = '';
    let fileName = '';

    try {
        if (language === 'java') {
            fileName = 'Main.java';
            await fs.writeFile(path.join(tempDir, fileName), code);
            cmd = `javac Main.java && java Main`;
        } else if (language === 'python') {
            fileName = 'script.py';
            await fs.writeFile(path.join(tempDir, fileName), code);
            // Using 'python' as standard for Windows, fallback to 'python3' on Unix
            cmd = os.platform() === 'win32' ? `python script.py` : `python3 script.py`;
        } else if (language === 'javascript') {
            fileName = 'script.js';
            await fs.writeFile(path.join(tempDir, fileName), code);
            cmd = `node script.js`;
        } else if (language === 'cpp') {
            fileName = 'main.cpp';
            await fs.writeFile(path.join(tempDir, fileName), code);
            cmd = os.platform() === 'win32' 
                ? `g++ main.cpp -o main.exe && main.exe`
                : `g++ main.cpp -o main && ./main`;
        } else {
            throw new Error(`Unsupported language: ${language}`);
        }

        return await new Promise((resolve, reject) => {
            const child = exec(cmd, { cwd: tempDir, timeout: timeoutMs + 1000 }, (error, stdout, stderr) => {
                if (error) {
                    if (error.killed) {
                        return reject(new Error("Time Limit Exceeded"));
                    }
                    const errMsg = stderr || stdout || error.message;
                    return reject(new Error(errMsg));
                }
                resolve(stdout);
            });
            
            // Hard timeout fallback
            setTimeout(() => {
                if (!child.killed) {
                    child.kill('SIGKILL');
                    reject(new Error("Time Limit Exceeded"));
                }
            }, timeoutMs);
        });
    } finally {
        // Guarantee cleanup of all files and folders after testing
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error("Cleanup failed for", tempDir, e);
        }
    }
}

module.exports = { executeLocally };
