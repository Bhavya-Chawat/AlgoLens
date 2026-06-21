const { expandTrace, getTrace } = require('./services/traceEngine');
require('dotenv').config();

const code = `
class Solution {
    public int lengthOfLongestSubstring(String s) {
        int left = 0;
        int maxLength = 0;
        for (int right = 0; right < s.length(); right++) {
            maxLength = Math.max(maxLength, right - left + 1);
        }
        return maxLength;
    }
}
`;

async function run() {
  const sf = {
    line: 7, event: "loop_iteration", codeWithValues: "for (int right = 0; right < s.length(); right++)",
    variables: { right: { value: 0 } }, dataStructureState: {}
  };
  const ef = {
    line: 7, event: "loop_iteration", codeWithValues: "for (int right = 0; right < s.length(); right++)",
    variables: { right: { value: 7 } }, dataStructureState: {}
  };

  console.log("Testing expandTrace...");
  const result = await expandTrace('custom', 'java', code, JSON.stringify([{s: "abcabcbb"}]), null, null, sf, ef);
  console.log(JSON.stringify(result.frames, null, 2));
}

run().catch(console.error);
