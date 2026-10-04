const path = require('path');

// quiet: dotenv v17 otherwise prints an "injecting env" banner on every start
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const list = (value, fallback) =>
  value ? value.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

// The browser UI is served either by Vite (dev, 5173-5179 with a /api proxy) or by this
// server itself (packaged app). Anything else is a foreign website and must be refused.
const allowedOrigins = list(process.env.ALLOWED_ORIGINS, [
  ...[5173, 5174, 5175, 5176, 5177, 5178, 5179, port].flatMap((p) => [
    `http://localhost:${p}`,
    `http://127.0.0.1:${p}`,
  ]),
]);

// Host header allow-list defeats DNS-rebinding (evil.example resolving to 127.0.0.1).
const allowedHosts = new Set(
  allowedOrigins.map((o) => new URL(o).host.toLowerCase()),
);

module.exports = {
  port,
  host,
  allowedOrigins,
  allowedHosts,
  // When set (packaged desktop app) every API call must carry this per-launch token.
  token: process.env.ALGOLENS_TOKEN || '',
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    // Optional dev convenience only. End users supply their own key in the UI.
    envKey: process.env.GROQ_API_KEY || '',
    modelOverride: process.env.GROQ_MODEL || '',
  },
  // Java / C++ run inside a Docker (or Podman) sandbox. 'local' is for development/tests only and
  // additionally needs ALGOLENS_UNSAFE_LOCAL_RUN=1 (no isolation at all).
  runner: {
    mode: process.env.RUNNER_MODE || 'auto',
    engine: process.env.CONTAINER_ENGINE || '',
    registry: process.env.ALGOLENS_IMAGE_REGISTRY || '', // e.g. ghcr.io/<owner>
    images: {
      java: process.env.RUNNER_IMAGE_JAVA || 'algolens/java:1',
      cpp: process.env.RUNNER_IMAGE_CPP || 'algolens/cpp:1',
    },
  },
  // Accounts and saved runs live in one SQLite file (Node's built-in node:sqlite: no extra install).
  // Under `node --test` the database is in memory so tests never touch real data.
  db: {
    file: process.env.ALGOLENS_DB || (process.env.NODE_TEST_CONTEXT ? ':memory:' : path.join(__dirname, 'data', 'algolens.db')),
    maxSolutionsPerUser: 300,
    maxRunsPerUser: 2000,
  },
  auth: {
    // Off by default: the app works without an account. Set to 1 to make every API call (and the UI) require one.
    requireLogin: process.env.ALGOLENS_REQUIRE_LOGIN === '1',
    allowRegistration: process.env.ALGOLENS_ALLOW_REGISTRATION !== '0',
    sessionDays: Number(process.env.ALGOLENS_SESSION_DAYS) || 30,
    // Behind HTTPS (a hosted server) the session cookie must be Secure.
    secureCookies: process.env.ALGOLENS_SECURE_COOKIES === '1',
  },
  ai: {
    // "Explain" is one AI call per run and only when asked; signed-in users also get a daily cap.
    dailyLimit: Number(process.env.ALGOLENS_AI_DAILY_LIMIT) || 40,
    timeoutMs: 30_000,
  },
  limits: {
    jsonBody: '1mb',
    codeChars: 200_000,
    hintChars: 24_000,
    storyChars: 16_000,
  },
};
