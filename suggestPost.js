require('dotenv').config();
const { google } = require('googleapis');
const puppeteer = require('puppeteer');

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
  });
  return auth.getClient();
}

async function collectUserTweets(twitterHandle) {
  // Clean the handle - remove @ symbol if present
  const cleanHandle = twitterHandle.replace(/^@/, '').trim();
  console.log(`🔍 Collecting tweets from @${cleanHandle}...`);
  
  let browser = null;
  let page = null;
  
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222'
    });
    
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    // Navigate to user's profile
    const profileUrl = `https://x.com/${cleanHandle}`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for tweets to load
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });
    
    // Scroll to load more tweets if needed
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Extract tweets
    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      return articles.slice(0, 10).map((article, index) => {
        try {
          // Get tweet text
          const textElement = article.querySelector('[data-testid="tweetText"]');
          const text = textElement ? textElement.innerText.trim() : '';
          
          // Get tweet link
          const timeElement = article.querySelector('time');
          const tweetLink = timeElement ? timeElement.closest('a')?.href : '';
          
          // Get relative time
          const timeText = timeElement ? timeElement.innerText : '';
          
          return {
            text,
            link: tweetLink,
            time: timeText,
            index: index + 1
          };
        } catch (e) {
          console.error(`Error extracting tweet ${index + 1}:`, e);
          return null;
        }
      }).filter(tweet => tweet && tweet.text && tweet.link);
    });
    
    console.log(`✅ Collected ${tweets.length} tweets from @${cleanHandle}`);
    return tweets;
    
  } catch (error) {
    console.error(`❌ Error collecting tweets from @${cleanHandle}:`, error.message);
    return [];
  } finally {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (e) {
      console.error('Error closing page:', e.message);
    }
    
    try {
      if (browser && browser.connected) {
        await browser.disconnect();
      }
    } catch (e) {
      console.error('Error disconnecting browser:', e.message);
    }
  }
}

async function getRecentTweetsFromSheet() {
  console.log(`🔍 Fetching recent tweets from "Relevant Tweets" sheet...`);
  
  try {
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Search for "Relevant Tweets" sheet
    const sheetsQuery = `name='Relevant Tweets' and mimeType='application/vnd.google-apps.spreadsheet'`;
    const sheetsResponse = await drive.files.list({
      q: sheetsQuery,
      fields: 'files(id, name)',
      orderBy: 'name'
    });
    
    if (!sheetsResponse.data.files || sheetsResponse.data.files.length === 0) {
      console.error('❌ "Relevant Tweets" sheet not found');
      return [];
    }
    
    const sheetId = sheetsResponse.data.files[0].id;
    
    // Get the most recent 10 tweets
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:E'
    });
    
    const rows = sheetResponse.data.values || [];
    
    // Take the last 10 rows (most recent tweets)
    const recentTweets = rows.slice(-10).map((row, index) => ({
      date: row[0] || 'N/A',
      handle: row[1] || '@unknown',
      text: row[2] || '',
      url: row[3] || '',
      followerCount: row[4] || 'N/A',
      index: index + 1
    })).filter(tweet => tweet.text && tweet.url);
    
    console.log(`✅ Retrieved ${recentTweets.length} recent tweets from sheet`);
    return recentTweets;
    
  } catch (error) {
    console.error(`❌ Error fetching tweets from sheet:`, error.message);
    return [];
  }
}

async function generateSuggestions(userTweets, recentTweets, targetHandle) {
  const isWindows = process.platform === 'win32';
  
  console.log(`🤖 Generating post suggestions for @${targetHandle} using Claude ${isWindows ? 'API' : 'CLI'}...`);
  
  const userTweetsText = userTweets.map((tweet, i) => 
    `${i + 1}. "${tweet.text}" (${tweet.time})`
  ).join('\n\n');
  
  const recentTweetsText = recentTweets.map((tweet, i) => 
    `${i + 1}. "${tweet.text}" by ${tweet.handle} (${tweet.date})\nURL: ${tweet.url}`
  ).join('\n\n');
  
  const prompt = `You are an AI assistant helping to suggest posts for a Twitter user based on their preferences and current trending topics.

**User Profile Analysis:**
Twitter Handle: @${targetHandle}

**User's Recent Tweets:**
${userTweetsText}

**Recent Trending/Relevant Tweets:**
${recentTweetsText}

**Task:**
Based on the user's recent tweets, analyze their posting style, interests, and preferences. Then suggest up to 3 tweets from the recent trending tweets that would align with their interests and style.

**Instructions:**
1. Analyze the user's tweet patterns, topics of interest, tone, and style
2. From the 10 recent trending tweets, select up to 3 that best match the user's preferences
3. For each suggested tweet, explain why it matches their interests
4. Provide engaging ways they could respond to or share these tweets

**Response Format:**
Please respond in JSON format:
{
  "userAnalysis": "Brief analysis of the user's posting style and interests",
  "suggestions": [
    {
      "tweetUrl": "original tweet URL",
      "tweetText": "original tweet text",
      "author": "original tweet author",
      "reason": "why this matches the user's interests",
      "engagementIdeas": ["idea 1", "idea 2", "idea 3"]
    }
  ]
}

If no tweets match the user's preferences, return an empty suggestions array.`;

  if (isWindows) {
    // Use Anthropic API for Windows
    return await generateSuggestionsWithAPI(prompt, targetHandle);
  } else {
    // Use Claude CLI for Mac/Linux
    return await generateSuggestionsWithCLI(prompt, targetHandle);
  }
}

// Windows: Use Anthropic API for suggestions
async function generateSuggestionsWithAPI(prompt, targetHandle) {
  const Anthropic = require('@anthropic-ai/sdk');
  
  let content = '';
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    console.log(`📝 Sending prompt to Claude API (${prompt.length} characters)`);
    
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    content = message.content[0].text.trim();
    
    console.log(`✅ Claude API completed successfully`);
    console.log(`📄 Raw output length: ${content.length} characters`);
    
    // Extract JSON from the response
    let jsonContent = content;
    const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    } else {
      const jsonMatch = content.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
    }
    
    const result = JSON.parse(jsonContent);
    console.log(`✅ Generated ${result.suggestions.length} post suggestions`);
    return result;
    
  } catch (error) {
    if (error.name === 'SyntaxError') {
      console.warn(`❌ Failed to parse Claude response: ${error.message}`);
      console.warn(`Raw output: ${content ? content.substring(0, 200) : 'No content'}...`);
    } else {
      console.warn(`❌ Claude API error: ${error.message}`);
    }
    return null;
  }
}

// Mac/Linux: Use Claude CLI for suggestions
async function generateSuggestionsWithCLI(prompt, targetHandle) {
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const claude = spawn('claude', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errorOutput = '';
    
    console.log(`📝 Sending prompt to Claude CLI (${prompt.length} characters)`);
    
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
        console.warn(`❌ Claude CLI exited with code ${code}`);
        console.warn(`Error output: ${errorOutput}`);
        resolve(null);
        return;
      }
      
      try {
        console.log(`✅ Claude CLI completed successfully`);
        console.log(`📄 Raw output length: ${output.length} characters`);
        const content = output.trim();
        // Extract JSON from the response
        let jsonContent = content;
        const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          jsonContent = codeBlockMatch[1];
        } else {
          const jsonMatch = content.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            jsonContent = jsonMatch[1];
          }
        }
        let result;
        try {
          result = JSON.parse(jsonContent);
        } catch (parseError) {
          console.warn(`❌ Failed to parse Claude response: ${parseError.message}`);
          console.warn(`Full raw output for debugging: ${content}`);
          resolve(null);
          return;
        }
        console.log(`✅ Generated ${result.suggestions.length} post suggestions`);
        resolve(result);
      } catch (parseError) {
        console.warn(`❌ Failed to parse Claude response: ${parseError.message}`);
        console.warn(`Full raw output for debugging: ${output}`);
        resolve(null);
      }
    });
    
    claude.on('error', (error) => {
      console.warn(`❌ Claude CLI error: ${error.message}`);
      resolve(null);
    });
  });
}

async function suggestPost(twitterHandle) {
  try {
    console.log(`🚀 Starting post suggestion process for @${twitterHandle}`);
    
    // Step 1: Collect user's tweets
    const userTweets = await collectUserTweets(twitterHandle);
    if (userTweets.length === 0) {
      return {
        success: false,
        message: `Could not collect tweets from @${twitterHandle}. Please check the handle and try again.`
      };
    }
    
    // Step 2: Get recent tweets from sheet
    const recentTweets = await getRecentTweetsFromSheet();
    if (recentTweets.length === 0) {
      return {
        success: false,
        message: 'Could not fetch recent tweets from the "Relevant Tweets" sheet.'
      };
    }
    
    // Step 3: Generate suggestions
    const suggestions = await generateSuggestions(userTweets, recentTweets, twitterHandle);
    if (!suggestions) {
      return {
        success: false,
        message: 'Failed to generate post suggestions. Claude CLI may not be available.'
      };
    }
    
    return {
      success: true,
      userAnalysis: suggestions.userAnalysis,
      suggestions: suggestions.suggestions,
      userTweetsCount: userTweets.length,
      recentTweetsCount: recentTweets.length
    };
    
  } catch (error) {
    console.error('Error in suggestPost:', error);
    return {
      success: false,
      message: `Error generating suggestions: ${error.message}`
    };
  }
}

module.exports = { suggestPost };