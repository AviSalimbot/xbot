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
  
  // Small initial delay to avoid conflicts with other browser operations
  const initialDelay = Math.random() * 2000; // 0-2 seconds
  console.log(`⏱️ Waiting ${Math.round(initialDelay/1000)}s before starting...`);
  await new Promise(resolve => setTimeout(resolve, initialDelay));
  
  // Simple browser lock mechanism to reduce conflicts
  const fs = require('fs');
  const lockFile = '.suggest_post_browser.lock';
  const maxLockAge = 120000; // 2 minutes max lock time
  
  // Check for existing lock
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const lockAge = Date.now() - lockData.timestamp;
      
      if (lockAge < maxLockAge) {
        // Lock is still valid, wait for it to be released
        console.log(`🔒 Browser is locked by another suggest post operation, waiting...`);
        let waitTime = 0;
        while (fs.existsSync(lockFile) && waitTime < 60000) { // Wait max 1 minute
          await new Promise(resolve => setTimeout(resolve, 2000));
          waitTime += 2000;
        }
      } else {
        // Lock is stale, remove it
        console.log(`🧹 Removing stale browser lock`);
        fs.unlinkSync(lockFile);
      }
    } catch (e) {
      // Corrupted lock file, remove it
      fs.unlinkSync(lockFile);
    }
  }
  
  // Create our lock
  fs.writeFileSync(lockFile, JSON.stringify({
    timestamp: Date.now(),
    handle: cleanHandle
  }));
  
  let browser = null;
  let page = null;
  
  try {
    // Aggressive retry logic to handle browser conflicts with monitoring
    let retries = 10;
    let lastError = null;
    
    while (retries > 0) {
      try {
        console.log(`🔗 Attempting browser connection... (${11 - retries}/10)`);
        browser = await puppeteer.connect({
          browserURL: 'http://127.0.0.1:9222'
        });
        console.log(`✅ Browser connection successful`);
        break;
      } catch (connectError) {
        lastError = connectError;
        retries--;
        
        if (retries === 0) {
          console.error(`❌ All browser connection attempts failed. Last error:`, connectError.message);
          throw new Error(`Browser connection failed after 10 attempts: ${connectError.message}`);
        }
        
        // Exponential backoff with jitter to avoid thundering herd
        const baseDelay = Math.min(1000 * (11 - retries), 8000); // Cap at 8 seconds
        const jitter = Math.random() * 1000; // Add up to 1 second of randomness
        const delay = baseDelay + jitter;
        
        console.log(`⚠️ Browser connection failed (${connectError.message}), retrying in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Create new page with retry logic
    let pageRetries = 5;
    while (pageRetries > 0) {
      try {
        console.log(`📄 Creating new page... (${6 - pageRetries}/5)`);
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        console.log(`✅ New page created successfully`);
        break;
      } catch (pageError) {
        pageRetries--;
        if (pageRetries === 0) {
          throw new Error(`Page creation failed after 5 attempts: ${pageError.message}`);
        }
        console.log(`⚠️ Page creation failed (${pageError.message}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Set user agent to avoid rate limiting
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to user's profile with retry logic
    const profileUrl = `https://x.com/${cleanHandle}`;
    console.log(`🌐 Navigating to ${profileUrl}...`);
    
    let navRetries = 3;
    while (navRetries > 0) {
      try {
        await page.goto(profileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        console.log(`✅ Navigation successful`);
        break;
      } catch (navError) {
        navRetries--;
        if (navRetries === 0) {
          throw new Error(`Navigation failed after 3 attempts: ${navError.message}`);
        }
        console.log(`⚠️ Navigation failed (${navError.message}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Wait for tweets to load with retries
    let tweetsLoaded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });
        tweetsLoaded = true;
        console.log(`✅ Tweets loaded successfully`);
        break;
      } catch (e) {
        console.log(`⚠️ Waiting for tweets... attempt ${attempt + 1}/3`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    if (!tweetsLoaded) {
      throw new Error('Could not load tweets from profile page');
    }
    
    // Improved scrolling to load more tweets
    console.log(`📜 Scrolling to load more tweets...`);
    let previousHeight = 0;
    let currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    for (let i = 0; i < 5; i++) {
      console.log(`📜 Scroll ${i + 1}/5...`);
      
      // Scroll down
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      
      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if new content loaded
      previousHeight = currentHeight;
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        console.log(`📜 No new content loaded, stopping scroll`);
        break;
      }
    }
    
    // Final wait for all content to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract tweets with better error handling
    console.log(`🔍 Extracting tweets from page...`);
    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      console.log(`Found ${articles.length} tweet articles`);
      
      return articles.slice(0, 15).map((article, index) => {
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
    // Ensure proper cleanup to avoid browser conflicts
    if (page) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (e) {
        console.error('Error closing page:', e.message);
        // Force close if needed
        try {
          await page.close();
        } catch (e2) {
          // Ignore secondary errors
        }
      }
    }
    
    if (browser) {
      try {
        if (browser.connected) {
          await browser.disconnect();
        }
      } catch (e) {
        console.error('Error disconnecting browser:', e.message);
        // Force disconnect if needed
        try {
          await browser.disconnect();
        } catch (e2) {
          // Ignore secondary errors
        }
      }
    }
    
    // Small delay to ensure cleanup completes
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Release browser lock
    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log(`🔓 Browser lock released`);
      }
    } catch (e) {
      console.error('Error releasing browser lock:', e.message);
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