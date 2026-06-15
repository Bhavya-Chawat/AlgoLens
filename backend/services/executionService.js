const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Map languages to Judge0 IDs
const JUDGE0_LANG_IDS = {
  javascript: 93,
  python: 71,
  java: 91,
  cpp: 54,
  c: 50
};

// Map languages to local commands/extensions
const LOCAL_CONFIG = {
  javascript: { ext: 'js', cmd: 'node', args: [] },
  python: { ext: 'py', cmd: 'python', args: [] }, // Or python3
  java: { ext: 'java', cmd: 'java', args: [] }, // Assuming Java 11+ supports single-file run `java file.java`
  cpp: { ext: 'cpp', compile: 'g++', compileArgs: ['-o'], run: './' },
};

async function runJudge0(language, code, input, apiKey) {
  const langId = JUDGE0_LANG_IDS[language];
  if (!langId) throw new Error(`Language ${language} not supported by Judge0`);

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
      stdin: input || ''
    })
  });

  if (!response.ok) {
    throw new Error(`Judge0 API Error: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status && result.status.id !== 3) {
    // 3 is Accepted. Any other status is an error (Compilation error, runtime error, etc)
    const errObj = {
      message: result.status.description,
      details: result.compile_output || result.stderr || result.message
    };
    return { success: false, error: errObj };
  }

  return { success: true, stdout: result.stdout };
}

async function runLocal(language, code, input) {
  const config = LOCAL_CONFIG[language];
  if (!config) throw new Error(`Language ${language} not supported locally`);

  const tempDir = path.join(process.cwd(), 'temp_exec');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const fileId = crypto.randomBytes(4).toString('hex');
  let fileName = `Solution_${fileId}.${config.ext}`;
  
  // Java class name must match file name if public, but for simple scripts it's fine.
  if (language === 'java') {
      fileName = 'Main.java'; // Assuming user uses 'class Main' for custom code, or we just rely on Java 11 single-file
  }

  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, code);

  return new Promise((resolve) => {
    let child;
    let executable = filePath;

    const runProcess = (cmd, args) => {
        const proc = spawn(cmd, args, { cwd: tempDir });
        let stdout = '';
        let stderr = '';

        if (input) {
            proc.stdin.write(input);
            proc.stdin.end();
        }

        proc.stdout.on('data', data => stdout += data.toString());
        proc.stderr.on('data', data => stderr += data.toString());

        proc.on('close', code => {
            // Cleanup
            try { fs.unlinkSync(filePath); } catch(e){}
            if (executable !== filePath) {
                try { fs.unlinkSync(executable); } catch(e){}
                try { fs.unlinkSync(executable + '.exe'); } catch(e){}
            }

            if (code !== 0) {
                resolve({ success: false, error: { message: 'Execution Error', details: stderr || stdout } });
            } else {
                resolve({ success: true, stdout });
            }
        });
    };

    if (config.compile) {
        // C++
        const outName = `out_${fileId}`;
        const compileProc = spawn(config.compile, [...config.compileArgs, outName, fileName], { cwd: tempDir });
        let compErr = '';
        compileProc.stderr.on('data', d => compErr += d.toString());
        compileProc.on('close', code => {
            if (code !== 0) {
                try { fs.unlinkSync(filePath); } catch(e){}
                resolve({ success: false, error: { message: 'Compilation Error', details: compErr } });
            } else {
                executable = path.join(tempDir, outName);
                runProcess(executable, []);
            }
        });
    } else {
        runProcess(config.cmd, [...config.args, fileName]);
    }
  });
}

async function runCustomCode(language, code, input, judge0ApiKey) {
  try {
    if (judge0ApiKey && judge0ApiKey.trim() !== '') {
      console.log('Using Judge0 for execution...');
      return await runJudge0(language, code, input, judge0ApiKey);
    } else {
      console.log('Using local execution fallback...');
      return await runLocal(language, code, input);
    }
  } catch (error) {
    return { success: false, error: { message: 'System Error', details: error.message } };
  }
}

module.exports = { runCustomCode };
