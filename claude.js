const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const os = require('os');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function analyzeTweet(tweetText) {
  return new Promise(async (resolve) => {
    const prompt = `You are a strict filter checking tweets against five criteria.
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

    const platform = os.platform();
    
    if (platform === 'win32') {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        const result = response.content[0].text.trim();
        
        if (result.startsWith('FAIL')) {
          console.log(`Tweet analysis result: ${result}`);
          resolve('FAIL');
        } else {
          console.log(`Tweet analysis result: PASS`);
          resolve('PASS');
        }
        
      } catch (error) {
        console.error('Claude analysis failed:', error.message);
        resolve('FAIL');
      }
    } else {
      const escapedPrompt = prompt.replace(/"/g, '\\"');
      const command = `claude "${escapedPrompt}"`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('CLI analysis failed:', error.message);
          resolve('FAIL');
          return;
        }
        
        const result = stdout.trim();
        
        if (result.startsWith('FAIL')) {
          console.log(`Tweet analysis result: ${result}`);
          resolve('FAIL');
        } else {
          console.log(`Tweet analysis result: PASS`);
          resolve('PASS');
        }
      });
    }
  });
}

module.exports = { analyzeTweet };