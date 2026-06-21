# AlgoLens — AI-Powered Algorithm Visualizer & Debugger

> **"See your code think."**  
> AlgoLens transforms static algorithms into living, interactive execution timelines — powered by AI that mentally executes your code so you never have to instrument a single `print` statement again.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Feature Reference](#feature-reference)
4. [How It Works — Under the Hood](#how-it-works--under-the-hood)
5. [User Guide](#user-guide)
6. [API Reference](#api-reference)
7. [Tech Stack](#tech-stack)
8. [Project Structure](#project-structure)
9. [Version History](#version-history)
10. [Deep Dive Documentation](#deep-dive-documentation)
11. [License](#license)

---

## Project Overview

Traditional debuggers show you what is happening at one moment in time. AlgoLens shows you the **entire history** of an algorithm's execution as an interactive, scrubbable timeline.

### The Problem
- Setting breakpoints in IDEs is manual, repetitive, and discards history the moment you step past a line.
- Abstract data structures (sliding windows, trees, DP tables) are impossible to visualize from raw variable watches.
- Supporting 4 languages (Python, Java, JavaScript, C++) with separate instrumentation pipelines is brittle and expensive to maintain.

### The Solution
AlgoLens uses a **Groq Large Language Model** as the "mental executor" — it reads your algorithm and produces a structured JSON timeline of every meaningful state change, frame by frame. The React frontend then renders this into a synchronized, scrub-able, visual experience with no manual work from you.

---

## System Architecture

```
  ┌────────────────────────────────────────────────────────────────┐
  │                     USER BROWSER (React + Vite)                │
  │                                                                │
  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
  │  │ Code Editor  │  │  Timeline    │  │  Inspector Panel     │  │
  │  │ (Monaco-like)│  │  Scrubber    │  │  · Variables         │  │
  │  │              │  │  + Expand    │  │  · Data Structures   │  │
  │  │  Highlights  │  │    Buttons   │  │  · Call Stack        │  │
  │  │  active line │  │              │  │                      │  │
  │  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
  │         │                 │                                    │
  │  ┌──────▼─────────────────▼──────────────────────────────────┐ │
  │  │          AppContext (React State Store)                    │ │
  │  │    executionTrace[], currentFrame, isSummarized            │ │
  │  └──────────────────────────┬────────────────────────────────┘ │
  │                             │  REST API (JSON)                 │
  └─────────────────────────────┼──────────────────────────────────┘
                                │
  ┌─────────────────────────────▼──────────────────────────────────┐
  │                  BACKEND (Node.js + Express)                    │
  │                                                                 │
  │   ┌──────────────────┐   ┌──────────────────────────────────┐  │
  │   │  routes/         │   │  services/                        │  │
  │   │  ├ POST /execute  │──▶│  ├ traceEngine.js  (orchestrator)│  │
  │   │  └ POST /expand   │   │  │   ├ analyzerService.js        │  │
  │   │                   │   │  │   │   └ Groq: classify code   │  │
  │   │  routes/          │   │  │   ├ promptModules.js          │  │
  │   │  └ GET /leetcode  │──▶│  │   │   └ build system prompt   │  │
  │   └──────────────────┘   │  │   └ Groq: mental execution    │  │
  │                           │  │                               │  │
  │                           │  ├ executionService.js           │  │
  │                           │  │   ├ Local: node/python/java   │  │
  │                           │  │   │        /g++ spawn         │  │
  │                           │  │   └ Cloud: Judge0 API         │  │
  │                           │  │                               │  │
  │                           │  ├ analyzerService.js            │  │
  │                           │  │   └ Groq: classify DS/Pattern │  │
  │                           │  │                               │  │
  │                           │  └ leetcodeService.js            │  │
  │                           │      └ Puppeteer scraper         │  │
  │                           └──────────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────┘
                   │                        │
       ┌───────────▼───────┐    ┌───────────▼───────────┐
       │  Groq LLM API      │    │  Judge0 Code Sandbox   │
       │  llama-3.3-70b     │    │  (RapidAPI CE Edition) │
       └───────────────────┘    └───────────────────────┘
```

### Data Flow — A Single Request

```
User clicks "Run"
      │
      ├─► [Backend] analyzerService.js
      │       Groq classifies the code:
      │       primaryStructure, helpers[], pattern, algorithmName
      │       → This shapes how the tracing prompt is built
      │
      ├─► [Backend] promptModules.js
      │       Builds a highly-structured system prompt with:
      │       · Chain-of-Thought scratchpad instructions
      │       · Diff-only delta format (to save tokens)
      │       · Strict JSON schema with event types
      │       · DS-specific rendering hints (e.g., tree node format)
      │
      ├─► [Backend] Groq API  (llama-3.3-70b-versatile)
      │       Model "mentally executes" the algorithm.
      │       Outputs: { isSummarized, frames[], result }
      │
      ├─► [Backend] traceEngine.js (post-processing)
      │       · Parses and validates the JSON
      │       · Resolves "diff-only deltas" (merges _add/_remove/_set)
      │       · Infers variable types (number → int, bool, etc.)
      │       · Normalizes short field names (c → codeWithValues, e → explanation)
      │       · Carries forward unchanged data structures between frames
      │
      └─► [Frontend] React AppContext
              Stores executionTrace[], renders Timeline + Canvas
              Expand buttons appear at frames where skippedNext: true
```

---

## Feature Reference

### 1. Multi-Language AI Tracing Engine
| Language   | Local Execution | Judge0 Cloud | AI Tracing |
|------------|-----------------|--------------|------------|
| Java       | ✅               | ✅            | ✅          |
| Python     | ✅               | ✅            | ✅          |
| JavaScript | ✅               | ✅            | ✅          |
| C++        | ✅ (g++)         | ✅            | ✅          |

The AI tracing engine does **not** run your code to get the trace — it interprets the logic semantically. This means traces work even if you don't have Java or Python installed locally.

### 2. Dynamic Recursive Expansion

AlgoLens solves the LLM token limit problem with a novel "Bird's-Eye View + Drill Down" architecture:

```
Full Execution (e.g., 100 iterations)

  Frame 0:  fn called           ← shown
  Frame 1:  iteration 1         ← shown
  Frame 2:  [EXPAND BUTTON]     ← skippedNext: true
  ...       iterations 2-98     ← hidden (gap)
  Frame 3:  final return        ← shown

User clicks Expand at Frame 2:
  → POST /api/execute/expand
  → AI fills in iterations 2-10 (next chunk)
  → New gap is detected at the end of chunk
  → [EXPAND BUTTON] shifts to end of new chunk

Repeat until all gaps are filled.
```

The Expand button dynamically relocates itself at every expansion, giving users the illusion of infinite granular drilling.

### 3. Synchronized Code Viewer
An embedded read-only code panel (left panel of the visualizer) that:
- Highlights the exact executing line in amber with a left-border accent
- Auto-scrolls to keep the active line vertically centered during playback
- Synchronizes line numbers via `onScroll` event binding — numbers never drift from the code

### 4. State Inspector Panel (Right Panel)
Parses every variable in the current frame and renders it as a typed widget:
- **Primitives:** `int`, `bool`, `str` displayed inline
- **Arrays:** Rendered as an index-labeled horizontal strip with pointer/window overlays
- **Hash Sets / Hash Maps:** Rendered as a membership/key-value table
- **Binary Trees:** Rendered as a node graph with active/visited/none highlighting
- **Call Stack:** Indented recursive depth ladder

### 5. Diff Debugger (Split-Screen)
- Run two independent code implementations simultaneously
- Two synchronized timelines appear at the bottom — scrubbing one scrubs both
- Ideal for: comparing brute-force vs optimal; understanding why TLE occurs

### 6. LeetCode Integration
Paste a LeetCode problem URL. The backend Puppeteer scraper automatically extracts:
- Problem title, difficulty, description
- Time & Space complexity
- Optimal starter code templates (Java/Python/C++/JS)
- Pre-built test cases from the problem constraints

### 7. AI Debug Assistant
A Groq-powered Socratic chatbot embedded in the left panel. It receives:
- The full user code
- The current execution trace (including whether it is summarized)
- Detected bugs flagged by the static analyzer
- The active LeetCode problem context (if any)

It is designed to **guide, not give away answers** — it asks clarifying questions and hints at the specific frame where a logic error occurs.

### 8. Bug Detector
A static analyzer (`analyzerService.js`) scans the execution trace for common patterns:
- Infinite loop detection (same state repeated N times)
- Off-by-one errors (loop termination condition mismatch)
- Null pointer dereferences (accessing a variable at null)
Detected bugs appear as clickable alerts in the left panel. Clicking a bug jumps the timeline to the exact frame.

---

## How It Works — Under the Hood

### The "Mental Execution" Paradigm

Traditional debuggers inject code and run it. AlgoLens instead sends the code to a Large Language Model with strict instructions to *think through the code step by step*, tracking every variable mutation as if it were the compiler.

**Why this works:**
- `llama-3.3-70b` has deep knowledge of every language's semantics, standard library, and runtime behavior
- It can extract the logical state (e.g., "the sliding window now spans indices 2-5") without requiring local language runtimes
- A single API supports Python, Java, C++, and JavaScript with identical output format

**The Output JSON Schema (simplified):**
```json
{
  "isSummarized": true,
  "algorithmName": "Sliding Window",
  "frames": [
    {
      "line": 12,
      "event": "loop_iteration",
      "skippedNext": true,
      "c": "set.add('a')",
      "e": "Add char to window set",
      "v": { "right": 0, "maxLength": 1 },
      "d": { "t": "string", "n": "s", "w": [0, 0] }
    }
  ],
  "result": 3
}
```

### The Delta Merge System
To minimize token usage and response size, the AI only outputs *changes* after Frame 0:
- `{ "_add": ["c"] }` → adds "c" to a set
- `{ "_remove": ["a"] }` → removes "a" from a set
- `{ "_set": { "2": 99 } }` → updates index 2 of an array to 99

The backend's `traceEngine.js` deep-merges these deltas against the previous frame's state before sending the complete trace to the frontend.

### The Prompt Architecture (V3 Modularized)
The prompts are assembled in layers by `promptModules.js`:
1. **`CORE_RULES`** — Pacing, delta format, strict JSON schema, chain-of-thought instructions
2. **`DS_SPECIFIC_HINTS`** — Injected only when the code uses trees, graphs, or linked lists (extra context to help the AI render nodes correctly)
3. **`EXPAND_INSTRUCTIONS`** — Used only for `/expand` requests: constrains the AI to only fill the gap between two specific frame boundaries

---

## User Guide

### Installation

**Prerequisites:** Node.js v18+, a free Groq API key from [console.groq.com](https://console.groq.com)

**Step 1 — Clone the repository**
```bash
git clone https://github.com/Bhavya-Chawat/AlgoLens.git
cd AlgoLens
```

**Step 2 — Configure the backend**
```bash
cd backend
npm install
cp .env.example .env
```
Open `.env` and add your key:
```
GROQ_API_KEY=gsk_your_key_here
```

**Step 3 — Start the backend**
```bash
npm start
# Server running at http://localhost:3000
```

**Step 4 — Start the frontend**
```bash
cd ../frontend
npm install
npm run dev
# App running at http://localhost:5173
```

---

### Using the LeetCode Mode

1. Open AlgoLens at `http://localhost:5173`
2. Make sure the **LeetCode** toggle is selected (top of editor)
3. Paste any LeetCode URL, e.g.: `https://leetcode.com/problems/longest-substring-without-repeating-characters/`
4. Click **Fetch Problem** — the editor auto-populates with the problem description, starter code, and test cases
5. Select your preferred language (Java is the default)
6. Click **Run Trace**

---

### Using the Custom Code Mode

1. Toggle to **Custom Code** mode
2. Write any algorithm directly in the editor
3. Provide test input in the **Testcases** tab on the left panel
4. Click **Run Trace**

---

### Navigating the Visualizer

| Action | Control |
|--------|---------|
| Step forward | `→` Arrow key or click `>` |
| Step backward | `←` Arrow key or click `<` |
| Play/Pause | `Space` |
| Jump to start | `Home` |
| Jump to end | `End` |
| Speed 0.25× | `1` |
| Speed 0.5× | `2` |
| Speed 1× | `3` |
| Speed 2× | `4` |
| Speed 4× | `5` |
| Toggle left panel | Click `CODE` tab on edge |
| Toggle right panel | Click `INSPECT` tab on edge |
| Toggle timeline | Click `TIMELINE` tab on bottom |

---

### Using the Expand Feature

When you see an **Expand** button between two frames on the timeline, it means the AI summarized that region.

1. Click the **Expand** button
2. The backend fires a targeted query to fill in that specific gap
3. New frames are spliced into the timeline at that position
4. If the filled chunk is still long, a new Expand button appears at the end of the new chunk
5. Repeat until you've drilled into every detail you need

---

### Using the Diff Debugger

1. Write your first solution in the main editor and run it
2. Open the left panel → click the **Diff Debug** tab
3. Paste your second solution into the Diff Debug editor
4. Click **Run Both** — the visualizer splits into two side-by-side canvases
5. Scrub the shared timeline to compare both executions frame by frame

---

## API Reference

### `POST /api/execute`
Generates an AI execution trace for the submitted code.

**Request Body:**
```json
{
  "editorMode": "leetcode | custom",
  "language": "java | python | javascript | cpp",
  "code": "class Solution { ... }",
  "testInput": [{ "s": "abcabcbb" }],
  "apiKey": "gsk_optional_override",
  "judge0ApiKey": "optional_judge0_key",
  "traceDepth": "standard"
}
```

**Response:**
```json
{
  "frames": [ ... ],
  "bugs": [ ... ],
  "result": "3",
  "algorithmName": "Sliding Window",
  "isSummarized": true,
  "tokenUsage": { "prompt": 1263, "completion": 733, "total": 1996 }
}
```

### `POST /api/execute/expand`
Expands the gap between two specific frames.

**Request Body:**
```json
{
  "editorMode": "leetcode",
  "language": "java",
  "code": "class Solution { ... }",
  "testInput": [{ "s": "abcabcbb" }],
  "startFrame": { "line": 12, "v": { "right": 1 } },
  "endFrame": { "line": 12, "v": { "right": 8 } }
}
```

**Response:**
```json
{
  "frames": [ ... ],
  "tokenUsage": { "prompt": 1466, "completion": 737, "total": 2203 }
}
```

### `GET /api/leetcode?url=<leetcode_url>`
Fetches problem metadata by scraping the given LeetCode URL via Puppeteer.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite | UI framework and dev server |
| State | React Context API | Global execution trace store |
| UI Icons | Lucide React | Consistent iconography |
| Backend | Node.js + Express | API routing and orchestration |
| AI Engine | Groq SDK (`llama-3.3-70b-versatile`) | Mental execution & analysis |
| Scraping | Puppeteer | LeetCode problem extraction |
| Cloud Execution | Judge0 CE via RapidAPI | Sandboxed code execution |
| Local Execution | Node `child_process.spawn` | Local fallback for all 4 languages |

---

## Project Structure

```
AlgoLens/
├── backend/
│   ├── routes/
│   │   ├── execute.js          # POST /execute and POST /execute/expand
│   │   └── leetcode.js         # GET /leetcode problem fetcher
│   ├── services/
│   │   ├── traceEngine.js      # Core AI orchestrator + post-processing
│   │   ├── promptModules.js    # Modularized prompt assembly (V3)
│   │   ├── analyzerService.js  # Code classifier (DS + pattern detection)
│   │   ├── executionService.js # Local spawn + Judge0 cloud runner
│   │   └── leetcodeService.js  # Puppeteer LeetCode scraper
│   └── server.js
│
└── frontend/
    └── src/
        ├── views/
        │   ├── EditorView.jsx      # Main code editing screen
        │   └── VisualizerView.jsx  # Main visualization screen
        ├── canvas/
        │   ├── ExecutionCanvas.jsx # Renders the visualization for current frame
        │   └── Visualizers.jsx     # DS-specific renderers (array, tree, graph)
        ├── components/
        │   ├── Timeline.jsx        # Timeline scrubber + Expand button logic
        │   ├── CodeEditor.jsx      # Editable + read-only code panel
        │   ├── TopBar.jsx          # Language selector, run button, controls
        │   ├── AIDebugAssistant.jsx# Socratic AI chat panel
        │   ├── DiffDebugger.jsx    # Split-screen dual trace setup
        │   ├── TestcaseLab.jsx     # Test case management UI
        │   └── inspector/          # Variable/structure/callstack tabs
        ├── context/
        │   └── AppContext.jsx      # Global state (executionTrace, currentFrame)
        └── engine/
            └── traceAnalyzer.js    # Builds prompt summary for AI Debug Assistant
```

---

## Version History

| Version | Branch | Description |
|---------|--------|-------------|
| v1.0 MVP | `v1-mvp` | Basic visualizer, manual code instrumentation, local execution setup |
| v2.0 Optimized | `v2-optimized-prompts` | Groq AI tracing engine, Diff Debugger, LeetCode integration, Inspector Panel |
| v3.0 Current | `v3-modularized-prompts` | Modularized prompts, Dynamic Recursive Expansion, Synchronized Code Viewer, Summarization-Aware AI Assistant |

For the complete evolution story including architectural pivots and why plans changed, see the `docs/` folder below.

---

## Deep Dive Documentation

| Document | Contents |
|----------|----------|
| [01. Project Overview & Features](docs/01_project_overview_and_features.md) | Full feature matrix, problem statement, target audience |
| [02. Architecture & Evolution](docs/02_architecture_and_evolution.md) | Why AST injection was abandoned, how Mental Execution works, how V3 solves token limits |
| [03. Testing & Validation](docs/03_testing_and_validation.md) | How AI schema violations are handled, backend stress testing, frontend integration testing |

---

## License

MIT License. See [LICENSE](LICENSE) for full terms. Free to use, modify, and distribute with attribution.
