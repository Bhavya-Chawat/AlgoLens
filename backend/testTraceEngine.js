const { getTrace } = require('./services/traceEngine');
require('dotenv').config();

(async () => {
  const code = `
  function bubbleSort(arr) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        if (arr[j] > arr[j + 1]) {
          let temp = arr[j];
          arr[j] = arr[j + 1];
          arr[j + 1] = temp;
        }
      }
    }
    return arr;
  }
  `;
  try {
    const result = await getTrace('js', 'javascript', code, [[4, 2, 7, 1]]);
    console.log(JSON.stringify(result.frames.slice(0, 5), null, 2));
  } catch (e) {
    console.error(e);
  }
})();
