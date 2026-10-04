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

You need [Node.js](https://nodejs.org) 20 or newer. For Java and C++ also install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
start.bat
```

It installs what is missing, frees the ports and opens the backend (`http://localhost:3000`) and the app (`http://localhost:5173`).

Or by hand, in two terminals:

```bash
cd backend && npm install && npm start
cd frontend && npm install && npm run dev
```

## AI hints (optional)

Open Settings in the app and paste your own free [Groq key](https://console.groq.com/keys). It stays in your browser; your local server forwards it to Groq and nowhere else. Tracing never needs it. A hint sends your code plus a short summary of the run, typically a few hundred tokens, and nothing is sent until you press **Get Hint**. Asking again about the same run reuses the answer.

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
cd frontend && npm test && npm run lint     # recognition engine, tracers, lenses, hints, edge cases
cd backend  && npm test                     # API security, inspector, LeetCode import, Groq client
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
backend/            local API: /api/run, /api/inspect, /api/runner/*, /api/hint, /api/leetcode
  services/exec     Docker runner client, C++ driver generator, trace collector
  services/inspect  tree-sitter parse of Java/C++ entry points and parameters
runner/             java/ (JDI tracer) and cpp/ (gdb tracer): Dockerfiles, sources, tests
frontend/src/
  tracers/          Python (Pyodide), JavaScript (Babel), adapter for Java/C++
  core/             AlgoTrace -> frames, bug detectors, timeline folding
  viz/              recognition engine (rec/) and lenses (ui/)
  engine/           run orchestration, edge-case generator, hint prompts
  constants/examples  the Examples menu
```

Backend settings are optional environment variables, see `backend/.env.example`.

## License

MIT
