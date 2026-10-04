const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Runs the Java tracer directly on THIS machine, with no sandbox.
 *
 * It exists for development and for the automated tests only, and is refused unless
 * ALGOLENS_UNSAFE_LOCAL_RUN=1 is set: a real user always runs inside the Docker sandbox.
 */
const JAVA_DIST = path.resolve(__dirname, '../../../../runner/java/dist');

function enabled() {
  return process.env.ALGOLENS_UNSAFE_LOCAL_RUN === '1';
}

function available(language) {
  return enabled() && language === 'java' && fs.existsSync(path.join(JAVA_DIST, 'algolens-java.jar'));
}

// Only what a JVM needs; never the user's environment (API keys, tokens ...).
function scrubbedEnv() {
  const keep = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'JAVA_HOME', 'LANG', 'HOME', 'USERPROFILE', 'ComSpec'];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  return env;
}

function run(language, jobJson, { timeoutMs, onLine }) {
  if (language !== 'java') return Promise.reject(new Error(`The local runner only supports Java (got ${language}).`));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'algolens-'));
  const classpath = [path.join(JAVA_DIST, 'algolens-java.jar'), path.join(JAVA_DIST, 'gson.jar')].join(path.delimiter);

  return new Promise((resolve) => {
    const child = spawn('java', [`-Dalgolens.work=${work}`, '-cp', classpath, 'AlgoRunner'], {
      env: scrubbedEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let buffer = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs + 5000);

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        onLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    child.stderr.on('data', (c) => { stderr = (stderr + c.toString('utf8')).slice(-2000); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (buffer.trim()) onLine(buffer);
      fs.rm(work, { recursive: true, force: true }, () => {});
      resolve({ code, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: err.message });
    });
    child.stdin.end(jobJson);
  });
}

module.exports = { enabled, available, run };
