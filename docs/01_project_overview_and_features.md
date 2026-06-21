# AlgoLens: Project Overview & Core Features

## 1. Executive Summary
AlgoLens is an advanced, AI-powered algorithm visualizer and interactive debugger. Designed to bridge the gap between static code and dynamic execution, AlgoLens helps software engineers, students, and educators deeply understand complex algorithms and data structures. By securely parsing multi-language code and translating it into a highly granular, step-by-step visual execution trace, AlgoLens transforms abstract logic into an intuitive graphical timeline.

## 2. Problem Statement
Traditional debugging tools and IDEs provide breakpoints and variable watchlists, but they often fail to offer a holistic, historical view of an algorithm's execution. 
* **Lack of Historical Context:** Once a debugger steps past a line, the previous state is lost unless meticulously recorded.
* **Cognitive Load:** Developers must mentally map how abstract data structures (like graphs, binary trees, or sets) mutate over time.
* **Accessibility:** Setting up local debugging environments for multiple languages (C++, Java, Python, JavaScript) is time-consuming for students and educators.

## 3. The AlgoLens Solution
AlgoLens solves these challenges by providing a **Time-Travel Debugging Experience**. It captures the entire lifecycle of an algorithm's execution and allows the user to scrub forward and backward in time, observing exact variable mutations, scope changes, and conditional branching without setting a single manual breakpoint.

## 4. Comprehensive Feature Matrix

### 4.1. Core Tracing Engine
* **Multi-Language Support:** First-class support for Python, JavaScript, Java, and C++.
* **Hybrid Execution Infrastructure:** 
  * *Local Mode:* Secure local process spawning for rapid execution.
  * *Cloud Mode:* Integration with Judge0 for scalable, sandboxed cloud execution.
* **AI-Driven "Mental Execution":** Utilizes Groq Large Language Models to natively interpret code logic, circumventing the need for brittle, language-specific AST (Abstract Syntax Tree) compilers.

### 4.2. Advanced Visualizer Canvas
* **Timeline Scrubber:** A responsive, frame-by-frame scrubbing interface allowing bidirectional time travel through the execution trace.
* **Synchronized Code Viewer:** An embedded code editor that perfectly mirrors the execution state, auto-scrolling and highlighting the exact line of code currently being executed.
* **State Inspector Panel:** A dedicated side-panel that parses complex data structures (Arrays, Maps, Sets) and visually renders their exact state at any given frame.
* **Call Stack Tracker:** Real-time visualization of recursive depths, function calls, and scope boundaries.

### 4.3. Educational & Debugging Utilities
* **Diff Debugger (Split-Screen):** Allows users to execute two different traces simultaneously and compare them side-by-side. Crucial for understanding why an optimized algorithm diverges from a brute-force approach.
* **LeetCode Integration:** Users can paste a LeetCode URL, and the backend automatically scrapes the problem description, metadata, time/space complexity, and optimal starter templates using Puppeteer.
* **Summarization-Aware AI Debug Assistant:** An integrated Socratic chatbot that analyzes the generated execution trace. If the trace contains summarized gaps (due to massive loops), the AI is contextually aware of these compressions and provides intelligent hints without hallucinating missing data.

## 5. Target Audience
* **Computer Science Students:** Visualizing abstract concepts like Dynamic Programming, Recursion Trees, and Graph Traversals.
* **Interview Candidates:** Preparing for FAANG technical interviews by deeply analyzing optimal solutions vs. brute-force failures.
* **Software Engineers:** Rapidly prototyping and debugging complex algorithmic logic before integrating it into enterprise codebases.
