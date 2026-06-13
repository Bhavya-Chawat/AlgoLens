const express = require('express');
const router = express.Router();
const { fetchLeetcodeProblem } = require('../services/leetcodeService');
const Groq = require('groq-sdk');

router.post('/fetch', async (req, res) => {
  try {
    const { url, apiKey } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'LeetCode URL is required.' });
    }

    const effectiveKey = apiKey || process.env.GROQ_API_KEY;
    if (!effectiveKey) {
      return res.status(400).json({ error: "No API key available. Set GROQ_API_KEY in .env or provide a custom key in the frontend." });
    }
    const groq = new Groq({ apiKey: effectiveKey });

    // Extract title slug from url (e.g. https://leetcode.com/problems/two-sum/)
    const match = url.match(/problems\/([^\/]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid LeetCode URL. Must contain /problems/title-slug' });
    }
    const titleSlug = match[1];

    const problemData = await fetchLeetcodeProblem(titleSlug);

    // Now, automatically parse the HTML content using Groq to generate structured testcases AND complexities
    const systemPrompt = `You are a LeetCode problem analyzer.
Given the HTML description of a LeetCode problem, extract the sample input testcases, the expected time complexity, and the expected space complexity.
Format the output strictly as a JSON object with this exact shape:
{
  "testcases": [{"nums": [2,7,11,15], "target": 9}, {"nums": [3,2,4], "target": 6}],
  "timeComplexity": "O(n log n)",
  "spaceComplexity": "O(1)"
}
If the complexities are not explicitly stated or obvious, estimate them based on the optimal standard algorithm for this problem.
Do not include any other text, only the raw JSON object.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: problemData.content }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
    });

    let jsonStr = completion.choices[0]?.message?.content || "{}";
    if (jsonStr.startsWith('\`\`\`json')) {
       jsonStr = jsonStr.replace(/\`\`\`json|\`\`\`/g, '').trim();
    }
    
    let parsedData = { testcases: [], timeComplexity: "O(?)", spaceComplexity: "O(?)" };
    try {
       parsedData = JSON.parse(jsonStr);
       // Handle case where it returned an array instead of object by accident
       if (Array.isArray(parsedData)) {
         parsedData = { testcases: parsedData, timeComplexity: "O(?)", spaceComplexity: "O(?)" };
       }
    } catch(e) {
       console.error("Failed to parse data from LLM:", jsonStr);
    }

    res.json({
      title: problemData.title,
      difficulty: problemData.difficulty,
      topicTags: problemData.topicTags,
      content: problemData.content,
      snippets: problemData.codeSnippets,
      testcases: parsedData.testcases || [],
      timeComplexity: parsedData.timeComplexity || "O(?)",
      spaceComplexity: parsedData.spaceComplexity || "O(?)"
    });

  } catch (error) {
    console.error('LeetCode route error:', error);
    res.status(500).json({ error: error.message || 'Internal server error fetching LeetCode data' });
  }
});

module.exports = router;
