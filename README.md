# AlgoLens

AlgoLens is an advanced, AI-powered algorithm visualizer and debugger designed to help developers and students seamlessly understand code execution flow. By converting static code into dynamic, line-by-line visual execution traces, AlgoLens demystifies complex algorithms and data structures.

![AlgoLens Architecture](https://via.placeholder.com/800x400.png?text=AlgoLens+Visualizer)

## 🌟 Key Features

- **Dynamic Visualizer**: Watch your variables change in real-time as your code executes line-by-line.
- **Hybrid Execution Engine**: 
  - **Local Execution Fallback**: Run Python, JavaScript, Java, and C++ safely on your local machine.
  - **Judge0 Cloud Execution**: Optionally securely execute code in the cloud using Judge0.
- **LeetCode Integration**: Paste a LeetCode URL, and AlgoLens will automatically fetch the problem description, code templates, optimal test cases, and estimate Time & Space complexity!
- **AI Tracing Engine**: Powered by Groq LLMs, the tracing engine intelligently instruments your code to extract deep AST execution state without you having to write a single log statement.

## 🛠 Tech Stack

### Frontend
- **React + Vite**: Fast, modern frontend architecture.
- **Monaco Editor**: The same powerful code editor that powers VS Code.
- **Lucide Icons**: Beautiful, consistent iconography.
- **Framer Motion**: (Planned) Smooth UI state transitions.

### Backend
- **Node.js + Express**: Lightweight, fast API routing.
- **Groq SDK**: Blazing fast AI inference for AST instrumentation and LeetCode HTML parsing.
- **Puppeteer**: Headless browser automation to seamlessly scrape LeetCode problems.
- **C++ (nlohmann/json) & Java (Gson)**: Industry-standard libraries securely bundled for robust backend execution fallbacks.

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- Python 3.8+, Java 17+, G++ (for local execution fallbacks)
- Groq API Key (for the AI tracing engine)

### Installation

1. **Clone the repository:**
   \`\`\`bash
   git clone https://github.com/yourusername/AlgoLens.git
   cd AlgoLens
   \`\`\`

2. **Setup the Backend:**
   \`\`\`bash
   cd backend
   npm install
   # Copy .env.example to .env and add: GROQ_API_KEY=your_key_here
   npm start
   \`\`\`

3. **Setup the Frontend:**
   \`\`\`bash
   cd ../frontend
   npm install
   npm run dev
   \`\`\`

4. **Open your browser:**
   Navigate to `http://localhost:5173` to start visualizing!

## 💡 How it works

1. You write custom code or fetch a LeetCode problem.
2. The code is sent to the backend where the **Groq AI AST Transformer** safely injects JSON print statements at every logical execution boundary.
3. The backend executes the modified code (either locally or via Judge0) and captures the JSON execution trace output.
4. The frontend parses this trace array and provides an interactive scrubbing UI for you to step forward and backward in time, rendering the complete state of memory at any given line!

## 📜 License

MIT License. Feel free to use, modify, and distribute.
