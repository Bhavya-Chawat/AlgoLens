// Hostile-program tests: the Docker sandbox must contain them. Skipped when Docker is not available.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildTrace } from '../../../frontend/src/core/frameBuilder.js';

const require = createRequire(import.meta.url);
const { runTrace, runnerStatus } = require('../../../backend/services/exec');

const status = await runnerStatus();
const ready = status.state === 'ready' && status.images.java;
const skip = ready ? false : 'Docker or the java runner image is not available';

async function run(code, name, extra = {}) {
  const wire = await runTrace({ language: 'java', code, entry: { className: 'Solution', name }, ...extra });
  return buildTrace(wire, code);
}

test('network is unreachable from inside the sandbox', { skip }, async () => {
  const built = await run(`class Solution {
    String f() {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new java.net.InetSocketAddress("1.1.1.1", 53), 2000);
            return "CONNECTED";
        } catch (Exception e) {
            return "blocked";
        }
    }
}`, 'f');
  assert.equal(built.resultRaw, 'blocked');
});

test('the filesystem is read-only except the scratch area', { skip }, async () => {
  const built = await run(`class Solution {
    String f() throws Exception {
        String r = "";
        try { new java.io.FileOutputStream("/etc/algolens-pwned").close(); r += "etc-writable "; } catch (Exception e) { r += "etc-blocked "; }
        try { new java.io.FileOutputStream("/opt/algolens/evil.jar").close(); r += "opt-writable "; } catch (Exception e) { r += "opt-blocked "; }
        return r.trim();
    }
}`, 'f');
  assert.equal(built.resultRaw, 'etc-blocked opt-blocked');
});

test('the host machine is invisible (no mounts, no user files, no secrets)', { skip }, async () => {
  process.env.GROQ_API_KEY = 'gsk_must_not_leak';
  const built = await run(`class Solution {
    String f() {
        boolean users = new java.io.File("/c/Users").exists() || new java.io.File("/mnt/c").exists() || new java.io.File("C:\\\\Users").exists();
        return users + "|" + System.getenv("GROQ_API_KEY");
    }
}`, 'f');
  assert.equal(built.resultRaw, 'false|null');
});

test('a memory bomb ends as an OutOfMemoryError, not a frozen machine', { skip }, async () => {
  const started = Date.now();
  const built = await run(`class Solution {
    int f() {
        List<long[]> hog = new ArrayList<>();
        while (true) {
            hog.add(new long[1_000_000]);
        }
    }
}`, 'f', { limits: { steps: 400, timeMs: 20_000 } });
  assert.ok(Date.now() - started < 40_000);
  assert.ok(built.error || built.truncated, 'the run must end with an error or the step limit');
});

test('a process bomb is contained by the pids limit', { skip }, async () => {
  const started = Date.now();
  const built = await run(`class Solution {
    int f() throws Exception {
        int started = 0;
        for (int i = 0; i < 2000; i++) {
            try {
                new ProcessBuilder("sleep", "30").start();
                started++;
            } catch (Exception e) {
                break;
            }
        }
        return started;
    }
}`, 'f', { limits: { steps: 5000, timeMs: 20_000 } });
  assert.ok(Date.now() - started < 60_000);
  // either it was stopped by the limit (small number) or the run ended in an error: never 2000 processes
  assert.ok(built.error || built.resultRaw < 1000, `started ${built.resultRaw} processes`);
});

test('a runaway program is stopped by the watchdog and the container is gone afterwards', { skip }, async () => {
  const started = Date.now();
  const built = await run(`class Solution {
    int f() {
        long x = 0;
        while (true) { x++; }
    }
}`, 'f', { limits: { steps: 5000, timeMs: 8000, idleMs: 2500 } });
  assert.ok(Date.now() - started < 30_000);
  assert.equal(built.error.type, 'Timeout');
});
