const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../../config');

/**
 * Runs a trace job inside a throw-away, locked-down container.
 *
 *   docker run --rm -i  --network none  --read-only  --cap-drop ALL  --memory/--cpus/--pids-limit
 *
 * The job goes in on stdin and the trace comes back on stdout: nothing is mounted from the
 * host and nothing persists. Works the same with Podman (same CLI).
 */
const RUNNER_ROOT = path.resolve(__dirname, '../../../../runner');

// Per-language container limits. gdb (C++) needs ptrace; nothing else extra is granted.
const PROFILE = {
  java: { memory: '768m', cpus: '2', pids: '256', extra: [] },
  cpp: { memory: '768m', cpus: '2', pids: '256', extra: ['--cap-add', 'SYS_PTRACE', '--security-opt', 'seccomp=unconfined'] },
};

class RunnerUnavailable extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunnerUnavailable';
    this.code = code;
  }
}

// Docker looks up its helpers (credential store, buildx...) on PATH. Right after installation the
// PATH inherited by this process is stale, so put the engine's own directory first.
function childEnv(bin) {
  if (!path.isAbsolute(bin)) return process.env;
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  return { ...process.env, [pathKey]: path.dirname(bin) + path.delimiter + (process.env[pathKey] || '') };
}

function exec(bin, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: childEnv(bin) }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, missing: error?.code === 'ENOENT', stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

let cache = { at: 0, value: null };

// Right after installing Docker Desktop the terminal's PATH is stale until the next sign-in:
// look in the standard install location too so it just works.
function knownInstallPaths() {
  if (process.platform !== 'win32') return [];
  const root = process.env.ProgramFiles || 'C:\Program Files';
  return [path.join(root, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe')].filter((p) => fs.existsSync(p));
}

/** { state: 'ready'|'stopped'|'missing', engine: 'docker'|'podman'|null } (cached for a few seconds) */
async function status({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 5000) return cache.value;
  const engines = [...new Set([config.runner.engine, 'docker', ...knownInstallPaths(), 'podman'].filter(Boolean))];
  let installed = null;
  let value = { state: 'missing', engine: null };
  for (const bin of engines) {
    const r = await exec(bin, ['info'], 8000);
    if (r.missing) continue;
    installed = bin;
    if (r.code === 0) { value = { state: 'ready', engine: bin }; break; }
  }
  if (value.state !== 'ready' && installed) value = { state: 'stopped', engine: installed };
  cache = { at: Date.now(), value };
  return value;
}

const imageName = (language) => config.runner.images[language];

async function hasImage(engine, language) {
  return (await exec(engine, ['image', 'inspect', imageName(language)], 8000)).code === 0;
}

/** Pulls the image from the registry, or builds it from the bundled runner/<language>/Dockerfile. */
async function ensureImage(language, onProgress = () => {}) {
  const st = await status({ fresh: true });
  if (st.state !== 'ready') throw new RunnerUnavailable(st.state === 'missing' ? 'docker_missing' : 'docker_stopped', 'Docker is not running.');
  if (await hasImage(st.engine, language)) return imageName(language);

  const image = imageName(language);
  const dir = path.join(RUNNER_ROOT, language);
  const streamed = (args) => new Promise((resolve) => {
    const child = spawn(st.engine, args, { windowsHide: true, env: childEnv(st.engine) });
    const relay = (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((l) => onProgress(l.slice(0, 160)));
    child.stdout.on('data', relay);
    child.stderr.on('data', relay);
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });

  if (config.runner.registry) {
    onProgress(`Downloading ${language} runner…`);
    if (await streamed(['pull', `${config.runner.registry}/${path.basename(image)}`])) {
      await exec(st.engine, ['tag', `${config.runner.registry}/${path.basename(image)}`, image]);
      return image;
    }
  }
  if (fs.existsSync(path.join(dir, 'Dockerfile'))) {
    onProgress(`Building the ${language} runner (first time only)…`);
    if (await streamed(['build', '-t', image, dir])) return image;
  }
  throw new RunnerUnavailable('image_unavailable', `The ${language} runner image could not be prepared.`);
}

/** Runs the job; resolves {code, stderr} when the container ends. Lines of stdout go to onLine. */
async function run(language, jobJson, { timeoutMs, onLine }) {
  const st = await status();
  if (st.state !== 'ready') {
    throw new RunnerUnavailable(st.state === 'missing' ? 'docker_missing' : 'docker_stopped',
      st.state === 'missing' ? 'Docker is not installed.' : 'Docker is installed but not running. Start Docker Desktop.');
  }
  if (!(await hasImage(st.engine, language))) throw new RunnerUnavailable('image_missing', `The ${language} runner is not downloaded yet.`);

  const profile = PROFILE[language];
  const name = `algolens-${crypto.randomBytes(6).toString('hex')}`;
  const args = [
    'run', '--rm', '-i', '--name', name,
    '--network', 'none',
    '--read-only',
    '--tmpfs', '/work:rw,exec,nosuid,size=128m,uid=10001',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
    '--memory', profile.memory, '--memory-swap', profile.memory,
    '--cpus', profile.cpus, '--pids-limit', profile.pids,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--user', '10001:10001',
    ...profile.extra,
    imageName(language),
  ];

  return new Promise((resolve) => {
    const child = spawn(st.engine, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: childEnv(st.engine) });
    let buffer = '';
    let stderr = '';
    let received = 0;
    const kill = () => {
      spawn(st.engine, ['kill', name], { windowsHide: true, stdio: 'ignore', env: childEnv(st.engine) }).on('error', () => {});
      child.kill();
    };
    const timer = setTimeout(kill, timeoutMs + 8000); // the runner has its own, earlier watchdog

    child.stdout.on('data', (chunk) => {
      received += chunk.length;
      if (received > 256 * 1024 * 1024) { kill(); return; } // runaway output guard
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
      resolve({ code, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: err.message });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(jobJson);
  });
}

module.exports = { status, ensureImage, hasImage, run, imageName, RunnerUnavailable };
