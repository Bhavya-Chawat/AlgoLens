# AlgoLens

AlgoLens shows you what your code **really did**. You write (or import) a program, press run, and every step is recorded by a real debugger or tracer: the line that ran, the call stack and every variable. Then it is drawn as pictures: arrays, graphs, trees, heaps, DP tables, union-find, call trees. Step forward and back to find your own bug.

Nothing is simulated. An earlier version asked an AI to guess the execution, and it made things up. Now the AI is an optional helper for hints only, and never produces a trace.

## Languages

| Language | How it is traced | Needs |
|---|---|---|
| Python | `sys.settrace` inside Pyodide, in your browser | nothing |
| JavaScript | Babel instrumenter in a Web Worker | nothing |
| Java | the JDK's own debugger (JDI), inside a Docker sandbox | Docker Desktop (free) |
| C++ | `g++` + `gdb` (Python API), inside a Docker sandbox | Docker Desktop (free) |

Java and C++ run with `--network none` in a throw-away container. The first Java or C++ run builds its runner image automatically. That happens once, downloads base images (so it needs internet) and can take a few minutes.

## Quick start (Windows)

You need [Node.js](https://nodejs.org) 22.13 or newer (accounts use its built-in SQLite, so nothing extra to install). For Java and C++ also install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
start.bat
```

It installs what is missing, frees the ports and opens the backend (`http://localhost:3000`) and the app (`http://localhost:5173`).

Or by hand, in two terminals:

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

## AI (optional, always on a button)

Press **AI key** in the top bar and paste your own free [Groq key](https://console.groq.com/keys). It stays in your browser; your local server forwards it to Groq and nowhere else. Tracing never needs it, and nothing is sent anywhere until you press one of two buttons:

- **Get Hint** sends your code plus a short summary of the run (a few hundred tokens) and returns a Socratic nudge. Asking again about the same run reuses the answer.
- **Explain this run** (above the pictures) makes one small request and gets back an algorithm name, one sentence, and a few *marks*: "the window is `i-k+1 .. i`", "this cell leaves, this one enters", "the cell being written is `dp[i][j]`, the one it reads is `dp[i-1][j-1]`", "the current node is `node`". The AI never supplies a number that gets drawn: every mark is an expression that AlgoLens evaluates against the real values of the step you are on, and anything that does not hold up against the run is dropped. It works for arrays, DP tables, graphs and union-find. The answer is cached per run, so the same run never costs a second request, and signed-in users get a daily cap (`ALGOLENS_AI_DAILY_LIMIT`, 40 by default).

## Accounts (optional)

The app works without one. **Sign in** (top bar) creates an account stored in a local SQLite file (`backend/data/algolens.db`, ignored by git):

- Every run you visualise while signed in is kept (its code once per distinct version, plus language, step count and the algorithm the AI named). **My history** reopens any of them.
- Passwords are salted scrypt hashes; the session is an HttpOnly cookie and the database keeps only a hash of it. There is no email, so a lost password cannot be reset. **Delete my account and all my data** is in My history.
- **Share the algorithm I used** is off until you turn it on. It lets AlgoLens say "others solved this problem with: Sliding window (3), Prefix sums (2)", from algorithm names and counts only, never code, and only once two or more people share. Your own earlier approaches to a problem are always shown to you.
- Set `ALGOLENS_REQUIRE_LOGIN=1` on the server to make an account mandatory (see `backend/.env.example`). To serve many people from one place, host the backend behind HTTPS with the settings listed there. Locally, "others" means people using the same installation.

## Panels

Every picture is a panel you control. The first three start open; each has a chip in the tray above them, so click a chip to open or close it. A panel can be folded (the arrow), closed (the X, its chip stays), and resized by dragging its bottom-right corner; the (i) says in one sentence what you are looking at. The code and inspector docks can be closed and dragged wider or narrower too. Your arrangement is remembered per program.

## How it works

```
 browser                                   local server (Node, 127.0.0.1:3000)        Docker
 ┌───────────────────────────┐   Java/C++   ┌──────────────────────────────┐   job    ┌─────────────────┐
 │ editor, examples, timeline│ ───────────► │ checks the request, finds the│ ───────► │ Java: JDI       │
 │ Python + JS tracers       │              │ function to call, wraps it in│ ◄─────── │ C++:  g++ + gdb │
 │ recognition engine + lenses◄───────────  │ a main(), starts the sandbox │  steps   └─────────────────┘
 └───────────────────────────┘   trace      └──────────────────────────────┘
```

1. **Tracers** produce one common step format ("AlgoTrace"), so nothing downstream depends on the language.
2. **The recognition engine** (`frontend/src/viz`) works out what each variable is from its shape, its history and how the code uses it (stack, queue, heap, graph, DP table, tree, union-find ...). Names are only hints. Where it is unsure, the plain Variables panel is still there.
3. **Lenses** draw each recognised structure. The timeline folds long loops and nested calls ("beats"), and nothing is skipped: you can expand any fold.

## Tests and lint

```bash
cd frontend && npm test && npm run lint     # recognition engine, tracers, lenses, story marks, panels, hints, edge cases
cd backend  && npm test                     # API security, accounts and saved data, story validation, inspector, LeetCode import, Groq client
cd runner/java && node --test "test/*.test.mjs"      # needs Docker + the Java image
cd runner/cpp  && node --test "test/*.test.mjs"      # needs Docker + the C++ image
cd runner      && node --test "test/*.test.mjs"      # the recognition engine on real Java/C++ traces
```

The runner suites skip themselves when Docker or the images are missing.

## Limits worth knowing

- A run records at most 20,000 steps for Python and JavaScript and 5,000 for Java and C++ (a debugger sees roughly 300 steps a second). After that it stops with a note. Big values are cut in all four tracers: about 60 items per list, 40 keys per dict, 4 levels deep and 80 nodes per tree or list.
- Structure recognition is heuristic. A layout it does not know is shown as plain variables rather than a picture.
- Java and C++ need Docker. Without it the app says so and how to fix it; it never falls back to a guess.

## Project layout

```
backend/            local API: /api/run, /api/inspect, /api/runner/*, /api/hint, /api/ai/story, /api/auth/*, /api/me/*, /api/leetcode
  services/exec     Docker runner client, C++ driver generator, trace collector
  services/inspect  tree-sitter parse of Java/C++ entry points and parameters
  services/db,auth,store   SQLite (built in), accounts and sessions, saved runs and the comparison query
  services/story    the "Explain this run" prompt and the validation of the model's answer
runner/             java/ (JDI tracer) and cpp/ (gdb tracer): Dockerfiles, sources, tests
frontend/src/
  tracers/          Python (Pyodide), JavaScript (Babel), adapter for Java/C++
  core/             AlgoTrace -> frames, bug detectors, timeline folding
  viz/              recognition engine (rec/), lenses and the panel manager (ui/), story marks (storyMarks.js)
  engine/           run orchestration, edge-case generator, hint prompts, explain-this-run (story.js)
  context/          app state and who is signed in
  constants/examples  the Examples menu
```

Backend settings are optional environment variables, see `backend/.env.example`.

## License

MIT
