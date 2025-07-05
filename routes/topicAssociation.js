const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

// Helper function to get Google Drive client
async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets'
    ],
  });
  
  const client = await auth.getClient();
  return google.drive({ version: 'v3', auth: client });
}

// Helper function to get available sheets from configured topic folder
async function getAvailableSheets() {
  try {
    const topic = process.env.TOPIC;
    if (!topic) {
      throw new Error('No topic configured. Please start the application with a topic parameter.');
    }

    // Read config.json to get the folder ID
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../config.json');
    
    if (!fs.existsSync(configPath)) {
      throw new Error('config.json not found');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const topicConfig = config[topic];
    
    if (!topicConfig || !topicConfig.folder) {
      throw new Error(`Topic '${topic}' or its folder ID not found in config.json`);
    }

    const drive = await getDriveClient();
    
    // Search for spreadsheets in the configured topic folder, excluding follow report sheets
    const sheetsQuery = `'${topicConfig.folder}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`;
    const sheetsResponse = await drive.files.list({
      q: sheetsQuery,
      fields: 'files(id, name)',
      orderBy: 'name'
    });
    
    // Filter out follow report sheets manually since the query syntax was causing issues
    const filteredSheets = sheetsResponse.data.files.filter(sheet => 
      !sheet.name.toLowerCase().includes('follow report')
    );
    
    return {
      sheets: filteredSheets,
      topicName: topicConfig.name,
      topic: topic
    };
  } catch (error) {
    console.error('Error getting available sheets:', error);
    return { sheets: [], topicName: 'Unknown', topic: 'unknown' };
  }
}

// Helper function to get tweets from Google Sheet
async function getTweetsFromSheet(sheetId, sheetRange) {
  try {
    if (!sheetId) {
      throw new Error('Sheet ID is required');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // Determine the range to fetch - we need at least columns A through E
    let range;
    
    if (sheetRange && sheetRange.trim()) {
      const userRange = sheetRange.trim();
      
      // If user specifies just row numbers like "1:10", convert to A1:E10
      const simpleRowMatch = userRange.match(/^(\d+):(\d+)$/);
      if (simpleRowMatch) {
        const startRow = simpleRowMatch[1];
        const endRow = simpleRowMatch[2];
        range = `A${startRow}:E${endRow}`;
        console.log(`📝 Converted range "${userRange}" to "${range}" to include all columns A-E`);
      }
      // If user specifies a column range like "A1:A10", convert it to include all needed columns
      else {
        const rowRangeMatch = userRange.match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/);
        if (rowRangeMatch) {
          const startRow = rowRangeMatch[1];
          const endRow = rowRangeMatch[2];
          range = `A${startRow}:E${endRow}`; // Always fetch A through E for the specified rows
          console.log(`📝 Converted range "${userRange}" to "${range}" to include all columns A-E`);
        } else {
          // Use as-is if it's already a proper range
          range = userRange;
        }
      }
    } else {
      // Get all data including all columns
      range = 'A:E';
    }
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range
    });
    
    const rows = response.data.values || [];
    
    console.log(`📊 Fetched ${rows.length} rows from range ${range}`);
    
    // Extract tweets with exact column structure: A=creationDate, B=handler, C=tweetText, D=tweetURL, E=followerCount
    const tweets = rows
      .map((row, index) => {
        if (!row || row.length < 3) {
          console.log(`⚠️ Row ${index + 1}: Insufficient columns (${row ? row.length : 0} columns)`);
          return null;
        }
        
        const creationDate = row[0] || 'N/A';           // Column A: creationDate
        const handler = row[1] || '@unknown';           // Column B: handler
        const tweetText = row[2] || '';                 // Column C: tweetText
        const tweetURL = row[3] || 'N/A';              // Column D: tweetURL
        const followerCount = row[4] || 'N/A';         // Column E: followerCount (optional)
        
        
        // Ensure handler has @ symbol
        const formattedHandler = handler.startsWith('@') ? handler : `@${handler}`;
        
        return {
          text: tweetText.trim(),
          handle: formattedHandler,
          url: tweetURL,
          date: creationDate,
          followerCount: followerCount,
          rowNumber: index + 1
        };
      })
      .filter(tweet => {
        if (!tweet || !tweet.text || tweet.text.length <= 50) {
          console.log(`❌ Filtered out tweet from row ${tweet ? tweet.rowNumber : 'unknown'}: "${tweet ? tweet.text.substring(0, 50) : 'empty'}" (${tweet ? tweet.text.length : 0} chars - too short)`);
          return false;
        }
        return true;
      }); // Use user-defined range, no artificial limit
    
    console.log(`✅ Processed tweets: ${tweets.length} valid tweets extracted`);
    console.log(`📋 Column structure: A=creationDate, B=handler, C=tweetText, D=tweetURL, E=followerCount`);
    
    return tweets;
  } catch (error) {
    throw new Error(`Failed to fetch tweets from Google Sheet: ${error.message}`);
  }
}

// Helper function to generate connections and replies using Anthropic API
async function generateConnectionsAndReplies(topic1, tweets) {
  const Anthropic = require('@anthropic-ai/sdk');
  
  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  // Create a detailed log
  const logEntry = {
    timestamp: new Date().toISOString(),
    topic: topic1,
    tweetsCount: tweets.length,
    tweets: tweets.map(t => ({
      rowNumber: t.rowNumber,
      handle: t.handle,
      text: t.text.substring(0, 100) + (t.text.length > 100 ? '...' : ''),
      date: t.date,
      hasUrl: t.url !== 'N/A',
      followerCount: t.followerCount,
      textLength: t.text.length
    }))
  };
  
  console.log(`🤖 Starting Anthropic API for topic: ${topic1} with ${tweets.length} tweets`);
  
  try {
    // Prepare the prompt for Anthropic API
    const prompt = `You are a clever and engaging Twitter user who replies to tweets by drawing smart or witty connections to broad social topics.

Input:

Broad Topic: ${topic1}

Tweets:
${tweets.map((tweet, index) => `${index + 1}. Tweet Text: "${tweet.text}"
Tweet Handle: ${tweet.handle}
Tweet URL: ${tweet.url}
Date: ${tweet.date}`).join('\n\n')}

Follow these steps strictly:
1. If the Tweet Text contains fewer than 4 meaningful words, or is vague/ambiguous, do not generate any connection or replies.
   - Instead, return:
     "connection": "Tweet is too short or vague for meaningful connection to ${topic1}."
     "replies": []           
2. If the tweet is detailed enough to suggest context or opinion, and you can genuinely connect it to ${topic1}, proceed to:
   - Write a brief connection summary explaining how it relates to ${topic1}.
   - Generate 5 tweet-length replies (≤280 characters), mixing:
     - Standalone witty insights (e.g.,
       "Inflation's got us paying steakhouse prices for rabbit food. At this rate, lettuce gonna be a luxury item soon 🥬📈")
     - Replies that explicitly mention the original tweet (e.g.,
       "Just like @handle said — steakhouse prices for lettuce. Inflation's turning salads into status symbols. https://twitter.com/handle/status/1234567890")
3. If no strong connection exists, return:
   - connection: "No meaningful connection to ${topic1}."
   - replies: []
   
Tone: Insightful, witty, sarcastic, or casually humorous—just like good Twitter replies.

Please format your response as a JSON array with this structure:
[
  {
    "originalTweet": "tweet text",
    "tweetHandle": "@handle",
    "tweetUrl": "url",
    "connection": "brief explanation of how this connects to ${topic1}",
    "replies": ["reply1", "reply2", "reply3", "reply4", "reply5"]
  }
]

Make sure the replies are diverse, witty, and truly connect the tweet content to ${topic1}.`;

    console.log(`📝 Sending prompt to Anthropic API (${prompt.length} characters)`);
    
    // Make API request
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4000, // Increased for multiple tweet responses
      temperature: 0.7, // Some creativity for witty replies
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    const output = response.content[0].text.trim();
    
    console.log(`✅ Anthropic API completed successfully`);
    console.log(`📄 Raw output length: ${output.length} characters`);
    
    // Extract JSON from the response
    const jsonMatch = output.match(/\[([\s\S]*)\]/);
    let result;
    
    if (jsonMatch) {
      result = JSON.parse(`[${jsonMatch[1]}]`);
    } else {
      // Try to parse the entire response
      result = JSON.parse(output);
    }
    
    // Enhance API results with original tweet metadata
    const enhancedResult = result.map((suggestion, index) => {
      const originalTweet = tweets[index] || {};
      return {
        ...suggestion,
        date: originalTweet.date || suggestion.date,
        followerCount: originalTweet.followerCount || suggestion.followerCount
      };
    });
    
    logEntry.result = 'success';
    logEntry.repliesGenerated = enhancedResult.length;
    logEntry.fallbackUsed = false;
    logEntry.apiResponse = output.substring(0, 500) + (output.length > 500 ? '...' : '');
    
    console.log(`🎯 Successfully generated ${enhancedResult.length} sets of replies`);
    
    writeConnectionLog(logEntry);
    return enhancedResult;
    
  } catch (error) {
    // Check if it's a JSON parsing error
    if (error.name === 'SyntaxError' || error.message.includes('JSON')) {
      console.warn(`❌ Failed to parse Anthropic response: ${error.message}`);
      
      logEntry.result = 'parse_failed';
      logEntry.parseError = error.message;
      logEntry.fallbackUsed = true;
    } else {
      // API or other error
      console.warn(`❌ Anthropic API error: ${error.message}`);
      
      logEntry.result = 'api_failed';
      logEntry.apiError = error.message;
      logEntry.fallbackUsed = true;
    }
    
    writeConnectionLog(logEntry);
    return generateFallbackData(topic1, tweets);
  }
}

// Helper function to write detailed logs
function writeConnectionLog(logEntry) {
  const fs = require('fs');
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    fs.appendFileSync('connection.log', logLine);
    console.log(`📝 Log written to connection.log`);
  } catch (error) {
    console.warn(`❌ Failed to write log: ${error.message}`);
  }
}

// Fallback function for when Claude CLI is not available - returns null to indicate no connections
function generateFallbackData(_, tweets) {
  console.log(`❌ Claude CLI failed - no connections will be generated for ${tweets.length} tweets`);
  return null; // Return null instead of template data
}

// GET route to fetch available sheets for the configured topic
router.get('/sheets', async (_, res) => {
  try {
    const result = await getAvailableSheets();
    
    res.json({
      success: true,
      message: `Found ${result.sheets.length} sheets for ${result.topicName}`,
      sheets: result.sheets,
      topicName: result.topicName,
      topic: result.topic
    });
  } catch (error) {
    console.error('Error fetching sheets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available sheets: ' + error.message,
      sheets: [],
      topicName: 'Unknown',
      topic: 'unknown'
    });
  }
});

// POST route for topic association
router.post('/', async (req, res) => {
  try {
    const { topic1, sheetId, sheetRange } = req.body;
    
    // topic1 is the manual broader topic for generating connections
    // The configured topic (from startup) is only used for folder selection (already done in sheets route)
    
    if (!topic1 || !sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Topic 1 and Sheet ID are required'
      });
    }
    
    console.log(`🚀 Topic Association request: ${topic1} | Sheet: ${sheetId} | Range: ${sheetRange || 'all'}`);

    // Check if required environment variables are set
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      return res.status(500).json({
        success: false,
        message: 'Google Service Account key file not configured'
      });
    }

    // Get tweets from Google Sheet
    const tweets = await getTweetsFromSheet(sheetId, sheetRange);

    if (tweets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No tweets found in the specified Google Sheet'
      });
    }

    // Generate connections and replies using Claude
    const suggestions = await generateConnectionsAndReplies(topic1, tweets);

    if (suggestions === null) {
      return res.json({
        success: false,
        message: 'No connections could be drawn. Claude CLI failed or is not available.',
        suggestions: []
      });
    }

    res.json({
      success: true,
      message: `Generated ${suggestions.length} topic connections and reply suggestions`,
      suggestions
    });

  } catch (error) {
    console.error('Error in topic association:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;