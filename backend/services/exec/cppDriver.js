/**
 * Generates the C++ `main()` that calls the user's function the way a LeetCode judge does:
 * arguments are taken from the JSON the user typed (by parameter name) and converted to the exact
 * parameter types by the converters in runner/cpp/algolens_driver.h (the JSON itself is read by algolens_rt.cpp).
 *
 * The signature comes from the server's own tree-sitter parse, never from the browser.
 */
const SAFE_TYPE = /^[\w:<>,*&\s]+$/;

function buildCppDriver(entry) {
  for (const p of entry.params) {
    if (!SAFE_TYPE.test(p.type || '') || !/^\w+$/.test(p.name)) {
      throw new Error(`Cannot pass JSON to parameter '${p.name}' of type '${p.type}'.`);
    }
  }
  const isVoid = /^\s*(?:const\s+)?void\s*$/.test(entry.returnType || '');
  const lines = ['int main(int argc, char** argv) {', '  algolens::JV args = algolens::read_json(argv[1]);'];

  entry.params.forEach((p, i) => {
    lines.push(`  using P${i} = std::remove_cv_t<std::remove_reference_t<${p.type}>>;`);
    lines.push(`  P${i} a${i} = algolens::arg<P${i}>(args, ${JSON.stringify(p.name)}, ${i});`);
  });

  const target = entry.className ? 'sol.' + entry.name : entry.name;
  if (entry.className) lines.push(`  ${entry.className} sol;`);
  const call = `${target}(${entry.params.map((_, i) => `a${i}`).join(', ')})`;
  if (isVoid) {
    lines.push(`  ${call};`, '  algolens::write_void(argv[2]);');
  } else {
    lines.push(`  auto result = ${call};`, '  algolens::write_result(argv[2], result);');
  }
  lines.push('  return 0;', '}');
  return lines.join('\n');
}

/** What gdb should break on to start tracing. */
function breakSpec(entry) {
  return entry.className ? `${entry.className}::${entry.name}` : entry.name;
}

module.exports = { buildCppDriver, breakSpec };
