const { generateDriver } = require('./traceEngine');
const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const code = `
class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) {
            return 0;
        }

        int leftDepth = maxDepth(root.left);
        int rightDepth = maxDepth(root.right);

        return 1 + Math.max(leftDepth, rightDepth);
    }
}
`;

const testInput = [[3,9,20,null,null,15,7]];

async function test() {
    const { getTrace } = require('./traceEngine');
    const result = await getTrace('editor', 'java', code, testInput, groqKey, null);
    console.log(result.frames ? result.frames.length + ' frames' : 'error');
    if (result.error) console.log(result.error);
    require('fs').writeFileSync('trace_out.json', JSON.stringify(result.frames, null, 2));
}
test();
