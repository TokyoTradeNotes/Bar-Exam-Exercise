export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, suggestedAnswer, userAnswer, model } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  const prompt =
`You are a Philippine Bar Exam evaluator. Assess the examinee's essay answer.

QUESTION:
${question}

SUGGESTED ANSWER (eCodalPro):
${suggestedAnswer || 'Not available'}

EXAMINEE'S ANSWER:
${userAnswer || '(No answer provided)'}

Respond in this exact format:
Score: X/5
Verdict: Pass / Fail
Feedback: [2–3 sentences on what was covered correctly, what key points were missed, and overall quality]

Note: Score must be a whole number from 0 to 5. No decimals.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
    res.json({ text: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
