// Use native Node.js fetch

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

async function fetchLeetcodeProblem(titleSlug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        content
        difficulty
        exampleTestcaseList
        topicTags {
          name
        }
        codeSnippets {
          lang
          langSlug
          code
        }
      }
    }
  `;

  const variables = { titleSlug };

  const response = await fetch(LEETCODE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`LeetCode API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (!data || !data.data || !data.data.question) {
    throw new Error('Problem not found or invalid response from LeetCode.');
  }

  return data.data.question;
}

module.exports = {
  fetchLeetcodeProblem,
};
