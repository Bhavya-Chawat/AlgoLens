// Builds the Java tracer: runner/java/dist/algolens-java.jar (+ gson.jar beside it).
// Used by the Dockerfile and by local development/tests. Requires a JDK (javac + jar) >= 21.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const build = join(here, 'build');
const dist = join(here, 'dist');
const gson = join(here, 'lib', 'gson.jar');

// Windows only puts shims for java/javac on PATH: find the JDK's real bin directory for `jar`.
function jdkBin() {
  const home = process.env.JAVA_HOME
    || /java.home = (.+)/.exec(spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' }).stderr || '')?.[1]?.trim();
  return home ? join(home, 'bin') : '';
}
const tool = (name) => {
  const dir = jdkBin();
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return dir && existsSync(join(dir, exe)) ? join(dir, exe) : name;
};

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
mkdirSync(dist, { recursive: true });

const sources = readdirSync(src).filter((f) => f.endsWith('.java')).map((f) => join(src, f));
execFileSync(tool('javac'), ['--release', '21', '-Xlint:-options', '-encoding', 'UTF-8', '-cp', gson, '-d', build, ...sources], { stdio: 'inherit' });
cpSync(join(src, 'LeetCodeHelpers.java.txt'), join(build, 'LeetCodeHelpers.java.txt'));
execFileSync(tool('jar'), ['cf', join(dist, 'algolens-java.jar'), '-C', build, '.'], { stdio: 'inherit' });
cpSync(gson, join(dist, 'gson.jar'));
console.log('built', join(dist, 'algolens-java.jar'));
