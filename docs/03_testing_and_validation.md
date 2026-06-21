# AlgoLens: Testing & Validation Methodology

Building an application that relies heavily on non-deterministic AI generation (Large Language Models) requires a robust and specialized testing methodology. This document details the testing strategies used to ensure the reliability, accuracy, and fault tolerance of AlgoLens.

## 1. Challenges of Testing AI-Driven Architectures
Unlike traditional deterministic functions (where Input A always equals Output B), LLMs introduce variability. The primary challenges addressed during testing were:
1. **Schema Violations:** The LLM failing to return valid, parsable JSON.
2. **Context Hallucinations:** The LLM inventing variable states that do not exist in the actual code.
3. **Token Truncation:** The LLM abruptly stopping generation mid-JSON due to output token limits.
4. **Granularity Drift:** The LLM switching between overly detailed micro-steps and overly vague summaries.

## 2. Backend Validation Strategies

### 2.1. Isolated Trace Validation Scripts
Dedicated backend test scripts (`testTraceEngine.js`, `testLongString.js`, `testContainsDuplicate.js`) were engineered to validate the `traceEngine.js` output entirely isolated from the React frontend.
* **Stress Testing:** We ran algorithms with massive `O(n^2)` loops or long `while` loops (e.g., Sliding Window algorithm on a 20+ character string) to force the LLM into token-limit scenarios.
* **Verification Checks:**
  * Did the JSON parse without throwing a `SyntaxError`?
  * Did the LLM correctly attach the `"skippedNext": true` flag to indicate a summarization gap?
  * Did the LLM respect the `MAX_FRAMES` pacing limits?

### 2.2. The Recursive Expand API Testing
Testing the V3 "Dynamic Recursive Expansion" feature required multi-stage validation:
1. **Initial Pass Validation:** Confirm the LLM correctly provided the "Bird's-Eye View" summary (e.g., Frames 1, 2, 10, 15).
2. **Delta State Injection:** Test the API's ability to inject "State A" (Frame 2) and "State B" (Frame 10) into a sub-prompt.
3. **Gap Resolution Validation:** Verify that the LLM successfully generated the missing intermediate steps (Frames 3 through 9) without violating the abstraction granularity of the original high-level trace.

## 3. Frontend Integration Testing

### 3.1. Trace Splicing & State Management
When the frontend requests expanded frames from the backend, it receives a chunk of intermediate frames.
* **Array Mutation Testing:** We manually verified the React state logic to ensure that `expandedFrames` were cleanly spliced into the exact index of the `executionTrace` array.
* **Boundary Integrity:** We verified that splicing did not accidentally duplicate or overwrite the critical boundary frames (`State A` and `State B`).

### 3.2. UI Synchronization & Parallel Scrolling
The introduction of the embedded Code Viewer required meticulous UI testing.
* **Auto-Scroll Math Validation:** Tested the `scrollTo` logic to ensure that as the timeline scrubber progresses, the Code Viewer calculates the exact `offsetTop` of the active line and forces it to remain vertically centered in the viewport.
* **Event Listener Syncing:** Verified that manual scrolling of the code container perfectly synchronized with the vertical Line Numbers container via `onScroll` event binding.

### 3.3. AI Debug Assistant "Summarization Awareness"
* **Scenario:** If the main trace skipped iterations 5 through 95, an unaware AI Assistant might incorrectly deduce that the user's loop logic is fundamentally broken because it "stops executing".
* **Validation:** We injected an `isSummarized` boolean flag into the prompt generation logic. We then cross-examined the AI Assistant's responses to ensure it recognized the trace was compressed, forcing it to focus its analysis on the final returned variables rather than hallucinating missing loop bugs.

## 4. Future Testing Roadmap
* **Automated CI/CD Pipeline:** Implement Jest and Supertest to automatically run a suite of 50+ standardized LeetCode algorithms against the Groq API on every pull request to guarantee JSON schema adherence over time.
* **Cypress E2E Testing:** Automate the frontend scrubbing and "Expand" button clicks to ensure UI stability across different browser viewports.
