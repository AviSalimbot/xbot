// Tweet analysis prompt for filtering tweets against criteria
const tweetAnalysisPrompt = (tweetText) => {
  return `You are a strict filter checking tweets against five criteria.
    1. Is NOT spammy
    2. Does NOT contain financial advice
    3. Is NOT from a bot
    4. Does NOT contain price predictions
    5. Does NOT contain political news
    
    Tweet: "${tweetText}"
    
    Return only one of these responses:
    - "PASS" if the tweet passes ALL criteria
    - "FAIL (Tweet is spam)" if it fails criteria 1
    - "FAIL (Tweet contains financial advice)" if it fails criteria 2
    - "FAIL (Tweet is from a bot)" if it fails criteria 3
    - "FAIL (Tweet contains price predictions)" if it fails criteria 4
    - "FAIL (Tweet contains political news)" if it fails criteria 5
    
    Return only the response, nothing else.`;
};

module.exports = { tweetAnalysisPrompt };