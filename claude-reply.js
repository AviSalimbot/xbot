const Anthropic = require('@anthropic-ai/sdk');
const { exec } = require('child_process');
const os = require('os');
const { replyGenerationPrompt } = require('./prompts/reply-generation');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function generateReply(tweetText, handle, topic) {
  return new Promise(async (resolve) => {
    console.log(`🤖 Starting AI reply generation for tweet from ${handle}`);
    const prompt = replyGenerationPrompt(tweetText, handle, topic);

    const platform = os.platform();
    
    if (platform === 'win32') {
      try {
        console.log(`📝 Sending to Claude API for reply generation...`);
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 150,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        const result = response.content[0].text.trim();
        console.log(`✅ Claude API reply generated: "${result}"`);
        
        // Ensure the reply is within Twitter's character limit
        if (result.length > 280) {
          const truncated = result.substring(0, 277) + '...';
          console.log(`⚠️ Reply truncated to fit Twitter limit: "${truncated}"`);
          resolve(truncated);
        } else {
          resolve(result);
        }
        
      } catch (error) {
        console.error(`❌ Claude API reply generation failed: ${error.message}`);
        resolve('');
      }
    } else {
      console.log(`📝 Sending to Claude CLI for reply generation...`);
      
      // Check if Claude CLI exists
      const fs = require('fs');
      const claudePath = '/usr/local/bin/claude';
      if (!fs.existsSync(claudePath)) {
        console.error(`❌ Claude CLI not found at ${claudePath}`);
        resolve('Great point! The ecosystem has been evolving nicely this year. 🚀');
        return;
      }
      
      const claude = require('child_process').spawn(claudePath, ['-'], { 
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000 
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
          resolve('');
          return;
        }
        
        let result = output.trim();
        console.log(`✅ Claude CLI raw response: "${result}"`);
        
        // Clean up the response by removing common AI explanations
        if (result.includes('**Reply suggestion:**')) {
          result = result.split('**Reply suggestion:**')[1].trim();
        } else if (result.includes('Here\'s a short, natural reply')) {
          result = result.split(/Here's a short, natural reply[^:]*:/)[1].trim();
        } else if (result.includes('Here\'s a natural reply:')) {
          result = result.split('Here\'s a natural reply:')[1].trim();
        } else if (result.includes('Reply:')) {
          result = result.split('Reply:')[1].trim();
        } else if (result.includes('Here\'s a response:')) {
          result = result.split('Here\'s a response:')[1].trim();
        }
        
        // Extract quoted content if present
        const quotedMatch = result.match(/"([^"]+)"/);
        if (quotedMatch) {
          result = quotedMatch[1];
        }
        
        // Remove quotes and extra explanatory text
        result = result.replace(/^["']|["']$/g, '');
        
        // Remove markdown formatting (bold, italic, etc.)
        result = result.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold **text**
        result = result.replace(/\*(.*?)\*/g, '$1');     // Remove italic *text*
        result = result.replace(/_(.*?)_/g, '$1');       // Remove italic _text_
        result = result.replace(/`(.*?)`/g, '$1');       // Remove code `text`
        
        // If we still have analysis, try to extract just the actual reply
        if (result.toLowerCase().includes('looking at this tweet') || 
            result.toLowerCase().includes('analyzing') ||
            result.toLowerCase().includes('this appears to be')) {
          const lines = result.split('\n');
          for (const line of lines) {
            const cleanLine = line.trim().replace(/^["']|["']$/g, '');
            // Look for lines that seem like actual replies (avoid analysis keywords)
            if (cleanLine.length > 10 && cleanLine.length <= 280 && 
                !cleanLine.toLowerCase().includes('looking at') &&
                !cleanLine.toLowerCase().includes('analyzing') &&
                !cleanLine.toLowerCase().includes('this appears') &&
                !cleanLine.toLowerCase().includes('this tweet') &&
                !cleanLine.toLowerCase().includes('about an ethereum') &&
                cleanLine.match(/[.!?]$/)) {  // Ends with punctuation
              result = cleanLine;
              break;
            }
          }
        }
        
        console.log(`✅ Cleaned reply: "${result}"`);
        
        // Ensure the reply is within Twitter's character limit
        if (result.length > 280) {
          const truncated = result.substring(0, 277) + '...';
          console.log(`⚠️ Reply truncated to fit Twitter limit: "${truncated}"`);
          resolve(truncated);
        } else {
          resolve(result);
        }
      });
      
      claude.on('error', (error) => {
        console.error(`❌ Claude CLI spawn error: ${error.message}`);
        resolve('');
      });
    }
  });
}

module.exports = { generateReply };