const GRAPHQL_URL = 'https://leetcode.com/graphql';

const QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      title
      titleSlug
      content
      difficulty
      exampleTestcaseList
      metaData
      topicTags { name }
      codeSnippets { lang langSlug code }
    }
  }
`;

// Accepts "https://leetcode.com/problems/two-sum/...", "leetcode.com/problems/two-sum" or just "two-sum".
const SLUG_RE = /^(?:(?:https?:\/\/)?(?:www\.)?leetcode\.com\/problems\/)?([a-z0-9][a-z0-9-]*)/i;

function extractSlug(input) {
  const match = String(input || '').trim().match(SLUG_RE);
  return match ? match[1].toLowerCase() : null;
}

const ENTITIES = { '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&amp;': '&' };

function htmlToText(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:quot|#39|lt|gt|nbsp|amp);/g, (e) => ENTITIES[e])
    .trim();
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** metaData is a JSON string: { name, params:[{name,type}], return:{type}, classname?, systemdesign? } */
function parseMeta(raw) {
  try {
    const meta = JSON.parse(raw);
    return {
      name: meta.name || null,
      params: (meta.params || []).map((p) => ({ name: p.name, type: p.type })),
      returnType: meta.return?.type ?? null,
      className: meta.classname || null,
      systemDesign: Boolean(meta.systemdesign),
    };
  } catch {
    return null;
  }
}

/**
 * exampleTestcaseList = ["[2,7,11,15]\n9", ...]: one parameter per line, in metaData order.
 * Returns [{ nums: [...], target: 9 }, ...].
 */
function parseTestcases(list, meta) {
  if (!Array.isArray(list) || !meta || meta.systemDesign || meta.params.length === 0) return [];
  return list
    .map((raw) => {
      const lines = String(raw).split('\n');
      if (lines.length !== meta.params.length) return null;
      const testcase = {};
      meta.params.forEach((param, i) => {
        testcase[param.name] = tryJson(lines[i].trim());
      });
      return testcase;
    })
    .filter(Boolean);
}

/** Expected outputs from the "Output:" line of every <pre> example block (null when unknown). */
function parseExpected(content) {
  const blocks = [...String(content || '').matchAll(/<pre>([\s\S]*?)<\/pre>/g)];
  return blocks
    .map((block) => htmlToText(block[1]).match(/Output:\s*(.+)/))
    .filter(Boolean)
    .map((m) => tryJson(m[1].trim()));
}

function parseQuestion(q) {
  const meta = parseMeta(q.metaData);
  const testcases = parseTestcases(q.exampleTestcaseList, meta);
  const expectedAll = parseExpected(q.content);
  return {
    title: q.title,
    slug: q.titleSlug,
    difficulty: q.difficulty,
    topicTags: q.topicTags || [],
    content: q.content,
    snippets: q.codeSnippets || [],
    signature: meta,
    testcases,
    // Only trust expected outputs when they line up one-to-one with the parsed examples.
    expected: expectedAll.length === testcases.length ? expectedAll : testcases.map(() => null),
    // Estimated later from the real trace (step growth), never guessed by an LLM.
    timeComplexity: null,
    spaceComplexity: null,
  };
}

const cache = new Map(); // slug -> { at, data }
const CACHE_MS = 60 * 60 * 1000;

async function fetchProblem(slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://leetcode.com',
    },
    body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
  });
  if (!res.ok) throw new Error(`LeetCode responded with HTTP ${res.status}.`);

  const body = await res.json();
  if (!body?.data?.question) throw new Error('Problem not found on LeetCode.');

  const data = parseQuestion(body.data.question);
  cache.set(slug, { at: Date.now(), data });
  return data;
}

module.exports = { extractSlug, parseMeta, parseTestcases, parseExpected, parseQuestion, fetchProblem };
