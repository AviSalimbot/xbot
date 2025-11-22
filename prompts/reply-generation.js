const replyGenerationPrompt = (tweetText, handle, topic) => {
  return `Reply to @${handle}'s tweet about ${topic}:

"${tweetText}"

CRITICAL: Respond with ONLY the reply text. No explanations, no analysis, no quotes around it. Just the raw reply text.

Requirements:
- Short, natural reply (under 130 characters unless absolutely necessary)
- Match the tweet's tone and energy — if it's hype, be hype; if it's chill, be chill
- Keep it conversational and authentic, like a real Twitter user
- Be concise, relevant, and punchy. 1 emoji max if it fits naturally
- Avoid filler words, questions, or long explanations

IMPORTANT: Output ONLY the reply text. Nothing else.`;
};


module.exports = { replyGenerationPrompt };