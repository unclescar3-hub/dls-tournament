const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function verifyMatchScreenshot(imagePath, submitterName, opponentName, claimedSubmitterScore, claimedOpponentScore) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const prompt = `You are an esports match result verifier for Unclescar Studios tournament platform.
    
Analyze this match result screenshot carefully.

The submitting player (${submitterName}) claims:
- Their score: ${claimedSubmitterScore}
- Opponent (${opponentName}) score: ${claimedOpponentScore}

Please check the screenshot and:
1. Identify what scores are visible
2. Identify any player names/usernames visible
3. Determine if the claimed scores match what's shown
4. Check if this looks like a legitimate game screenshot (not edited)

Respond ONLY with valid JSON in this exact format:
{
  "verified": true or false,
  "confidence": "high", "medium", or "low",
  "visible_score_home": number or null,
  "visible_score_away": number or null,
  "scores_match_claim": true or false,
  "looks_legitimate": true or false,
  "notes": "brief explanation"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Image, mimeType } }
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemini response');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Gemini error:', err.message);
    return {
      verified: false,
      confidence: 'low',
      scores_match_claim: null,
      looks_legitimate: null,
      notes: 'AI verification failed: ' + err.message
    };
  }
}

module.exports = { verifyMatchScreenshot };
