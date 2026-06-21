# AlgoLens: Architecture & Technical Evolution

## 1. Executive Summary

This document provides a deep technical account of every major architectural decision made during the development of AlgoLens — including the approaches that were attempted, the reasons they were abandoned, and the novel solutions that replaced them.

---

## 2. Phase 1: The AST Injection Approach (Abandoned, Pre-V1)

### The Initial Concept
The first architecture planned for AlgoLens was a true **AST (Abstract Syntax Tree) injection pipeline**:
1. Parse the user's source code into an AST using a language-specific parser.
2. Walk the AST and inject `print()` / `console.log()` / `System.out.println()` statements after every logical boundary (assignments, conditionals, return statements).
3. Execute the modified code and capture `stdout`.
4. Parse the structured output into a frame array for the visualizer.

### Why It Was Abandoned
- **Compilers are hard:** Building a correct, bug-free AST walker for even one language requires implementing large portions of a compiler frontend — handling operator precedence, scope resolution, shadowed variables, and complex type hierarchies.
- **Four languages × four compilers:** Doing this for Python, Java, C++, and JavaScript required four completely separate implementations, each with different AST node types and runtime semantics.
- **C++ is inherently hostile to runtime introspection:** Unlike dynamic languages, C++ pointers, references, and stack-allocated structs cannot be easily serialized into JSON from injected print statements without deep knowledge of the type system at compile time.
- **Maintenance burden:** Every language update (e.g., Python 3.12 pattern matching, Java 21 records) would break the parser.

### The Turning Point
The realization was that the bottleneck was not *execution* — it was *state extraction*. We needed something that already understood the semantics of all four languages natively. That something was a Large Language Model.

---

## 3. Phase 2: AI "Mental Execution" Engine (V2)

### The Core Insight
Rather than running code and intercepting output, AlgoLens sends the raw source code to a Groq-hosted LLM with a highly structured system prompt. The LLM acts as both the compiler and the runtime — it reads the code, mentally simulates its execution, and outputs a structured JSON array of execution frames.

### Why Groq?
- **Speed:** Groq's custom LPU (Language Processing Unit) hardware delivers inference speeds significantly faster than GPU-based providers, which is critical for a product where users are waiting for real-time feedback.
- **Model quality:** `llama-3.3-70b-versatile` has exceptional performance on code reasoning and structured JSON generation tasks.

### The Output Schema
The AI is constrained to output a specific, versioned JSON schema:

```json
{
  "isSummarized": false,
  "algorithmName": "Sliding Window Maximum",
  "metadata": {
    "algorithm": "Sliding Window",
    "dataStructure": "HashSet",
    "timeComplexity": "O(n)",
    "spaceComplexity": "O(min(n, m))"
  },
  "frames": [
    {
      "line": 8,
      "event": "assignment",
      "c": "int left = 0",
      "e": "Initialize left pointer",
      "v": { "left": { "type": "int", "value": 0 } },
      "d": { "t": "string", "n": "s", "w": [0, 0], "p": {"left": 0, "right": 0} }
    }
  ],
  "result": 3
}
```

### The Delta Merge System
Outputting the full variable and data structure state on every frame is extremely token-expensive. V2 introduced a **diff-only delta format**:
- Frame 0 always contains the full initial state.
- Subsequent frames output *only changed fields*.
- Collections use delta commands instead of full re-serialization:
  - `{ "_add": ["c"] }` — append to set/array
  - `{ "_remove": ["a"] }` — remove from set/array
  - `{ "_set": { "2": 99 } }` — update specific index/key

The `traceEngine.js` post-processor deep-merges these deltas against the previous frame's full state before sending anything to the frontend. This reduced average response payload by ~60%.

### V2 Feature Additions
- **Code Analysis Pre-Pass (`analyzerService.js`):** Before building the tracing prompt, a separate, lightweight Groq call classifies the algorithm's primary data structure, helper structures, and pattern type. This classification is used to inject DS-specific rendering hints (e.g., for binary trees, the AI is told the exact node JSON format the frontend expects).
- **LeetCode Scraper (`leetcodeService.js`):** Puppeteer automates a headless Chromium browser to navigate to the LeetCode URL and extract problem title, description, examples, complexity, and starter code.
- **Diff Debugger:** The frontend was updated to support running two traces simultaneously and rendering a split-screen visualizer canvas.

---

## 4. Phase 3: Solving the Scalability Crisis (V3)

### The Token Limit Problem
The V2 engine worked well for algorithms under ~40 lines. For longer loops (e.g., a Sliding Window on a 30-character string requires ~50-100 iteration frames), the LLM would:
1. Run out of output tokens and truncate the JSON mid-stream — causing a `SyntaxError` on the frontend.
2. Hallucinate frames by filling in values that were never in the code.
3. Deliver inconsistent granularity — some iterations shown in 3 frames, others collapsed into 1.

### The Attempted Fixes
Before the final solution, several intermediate approaches were tried:
- **Increasing `max_tokens`:** Helped marginally but caused inference latency to spike and didn't solve the context degradation problem at 80+ frames.
- **Chunked requests (sequential):** Break the trace into chunks and request each separately. Failed because each chunk had no memory of the previous chunk's state — the LLM couldn't correctly continue variables without the full preceding history.
- **Filtering frames client-side:** Show only key frames (every 5th frame). Worked cosmetically but the data was still being generated and wasted tokens.

### The Final Solution: Dynamic Recursive Expansion

The architecture that solved this is **Bird's-Eye View + On-Demand Expansion**:

**Step 1 — Summary Generation (initial `POST /execute` request):**
The LLM is strictly instructed to produce a maximum of 15-20 key frames. For long loops, it must aggressively summarize — showing the first full iteration and jumping to the final return or last few significant state changes. Any frame immediately before a skipped section gets `"skippedNext": true` appended to it.

**Step 2 — Gap Detection (frontend `Timeline.jsx`):**
When `executionTrace` is populated, `Timeline.jsx` scans every frame for `skippedNext: true`. At those frame positions, it renders an **Expand** button overlaid on the timeline.

**Step 3 — Targeted Expansion (`POST /execute/expand`):**
Clicking Expand fires a new API request that sends:
- The original code and test input (for context)
- `startFrame` — the full state of the frame immediately before the gap
- `endFrame` — the full state of the frame immediately after the gap

The `expandTrace` function in `traceEngine.js` builds a specialized prompt (`EXPAND_INSTRUCTIONS` module) instructing the LLM to **only generate the missing frames between those two specific states**. It is bounded to max 10 frames per expansion.

**Step 4 — Splice and Recurse (frontend `Timeline.jsx`):**
The returned `expandedFrames` are spliced into `executionTrace` at the exact gap position. The frame that had `skippedNext: true` has that flag removed (so its Expand button disappears). If the newly inserted chunk itself contains a gap (because 10 frames wasn't enough to fill all the missing iterations), a new `skippedNext` flag was placed by the AI, and a new Expand button appears — ready for the next drill-down.

### V3 Additional Changes

**Modularized Prompts (`promptModules.js`):**
Previously, the system prompt was a single monolithic 200-line string embedded in `traceEngine.js`. V3 split it into named, composable modules:
- `CORE_RULES` — the universal pacing and JSON schema rules
- `DS_HINTS` — injected only when trees/graphs/linked lists are detected
- `EXPAND_INSTRUCTIONS` — used exclusively by the expand endpoint

This dramatically reduced the maintenance surface for prompt engineering.

**Summarization-Aware AI Debug Assistant:**
The AI Debug Assistant (`AIDebugAssistant.jsx`) was updated to receive an `isSummarized` boolean alongside the trace. When `true`, the assistant's system prompt explicitly acknowledges that "some loop iterations have been compressed" — preventing it from incorrectly diagnosing missing loop frames as algorithmic bugs.

**Synchronized Code Viewer:**
The left panel of the Visualizer was upgraded from a static "currently executing line" indicator to a full embedded, read-only `CodeEditor` component in `readonly` mode. It:
- Receives `activeLineIndex` from the current frame's `line` field
- Auto-scrolls to keep that line vertically centered in the viewport every time the frame changes
- Synchronizes the line number gutter scroll position with the code body scroll position via `onScroll` event binding

---

## 5. Architecture Decisions Summary

| Decision | Chosen Approach | Reason |
|----------|----------------|--------|
| Code State Extraction | LLM Mental Execution | Eliminates per-language AST compilers |
| LLM Provider | Groq (`llama-3.3-70b`) | Fastest inference, strong code reasoning |
| Token Optimization | Diff-only delta format | ~60% payload reduction |
| Long Trace Handling | Dynamic Recursive Expansion | Bypasses token limits entirely |
| Prompt Organization | Modular named exports | Easier iteration and maintenance |
| LeetCode Scraping | Puppeteer headless browser | Full JS rendering, no API key needed |
| Cloud Code Execution | Judge0 CE via RapidAPI | Sandboxed, multi-language, free tier |
| Frontend State | React Context API | Single store, no Redux overhead |
