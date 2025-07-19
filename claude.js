const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const os = require('os');
const { tweetAnalysisPrompt } = require('./prompts/tweet-analysis');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function analyzeTweet(tweetText) {
  return new Promise(async (resolve) => {
    console.log(`🤖 Starting AI analysis for tweet: "${tweetText.substring(0, 50)}..."`);
    const prompt = tweetAnalysisPrompt(tweetText);

    const platform = os.platform();
    
    if (platform === 'win32') {
      try {
        console.log(`📝 Sending to Claude API...`);
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        const result = response.content[0].text.trim();
        console.log(`✅ Claude API response: ${result}`);
        
        if (result.startsWith('FAIL')) {
          resolve(result);
        } else {
          resolve('PASS');
        }
        
      } catch (error) {
        console.error(`❌ Claude API analysis failed: ${error.message}`);
        resolve('FAIL (API Error)');
      }
    } else {
      console.log(`📝 Sending to Claude CLI...`);
      const claude = require('child_process').spawn('claude', ['-'], { 
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 45000 
      });
      
      let output = '';
      let errorOutput = '';
      
      claude.stdin.write(prompt);
      claude.stdin.end();
      
      claude.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      claude.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      claude.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ Claude CLI failed with exit code ${code}`);
          if (errorOutput) console.error(`CLI stderr: ${errorOutput}`);
          resolve('FAIL (CLI Error)');
          return;
        }
        
        const result = output.trim();
        console.log(`✅ Claude CLI response: ${result}`);
        
        if (result.startsWith('FAIL')) {
          resolve(result);
        } else {
          resolve('PASS');
        }
      });
      
      claude.on('error', (error) => {
        console.error(`❌ Claude CLI spawn error: ${error.message}`);
        resolve('FAIL (CLI Error)');
      });
    }
  });
}

module.exports = { analyzeTweet };