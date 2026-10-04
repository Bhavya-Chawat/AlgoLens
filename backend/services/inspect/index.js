const { inspectJava } = require('./java');
const { inspectCpp } = require('./cpp');

const INSPECTORS = { java: inspectJava, cpp: inspectCpp };

/** { entries:[{name,className,params,returnType,line,isHelper}], scriptLike } for Java / C++ source. */
async function inspect(language, code) {
  const fn = INSPECTORS[language];
  if (!fn) throw new Error(`${language} is inspected in the browser.`);
  return fn(code);
}

module.exports = { inspect, SUPPORTED: Object.keys(INSPECTORS) };
