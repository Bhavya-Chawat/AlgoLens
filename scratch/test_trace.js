const { getTrace } = require('../backend/services/traceEngine.js');
const code = `
function lengthOfLongestSubstring(s) {
  let set = new Set();
  let left = 0, right = 0, maxLen = 0;
  while(right < s.length) {
    if(!set.has(s[right])) {
      set.add(s[right]);
      maxLen = Math.max(maxLen, right - left + 1);
      right++;
    } else {
      set.delete(s[left]);
      left++;
    }
  }
  return maxLen;
}`;

getTrace(null, 'javascript', code, ["abcabcbb"], process.env.GROQ_API_KEY).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
