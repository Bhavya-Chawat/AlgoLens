const { getTrace } = require('./services/traceEngine');
require('dotenv').config();

(async () => {
  const code = `
  class Solution {
      public boolean containsDuplicate(int[] nums) {
          Set<Integer> set = new HashSet<>();
          for (int num : nums) {
              if (set.contains(num)) return true;
              set.add(num);
          }
          return false;
      }
  }
  `;
  try {
    const result = await getTrace('java', 'java', code, [[1, 2, 3, 1]]);
    console.log(JSON.stringify(result.frames.slice(0, 5), null, 2));
  } catch (e) {
    console.error(e);
  }
})();
