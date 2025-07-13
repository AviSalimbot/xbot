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

// Helper function to generate connections and replies using Claude CLI or API
async function generateConnectionsAndReplies(topic1, tweets) {
  const isWindows = process.platform === 'win32';
  
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
  
  console.log(`🤖 Generating connections using Claude ${isWindows ? 'API' : 'CLI'} for topic: ${topic1} with ${tweets.length} tweets`);
  
  // Prepare the prompt - optimized for token efficiency
  const prompt = `Generate witty Twitter connections to topic: ${topic1}

Tweets:
${tweets.map((tweet, index) => `${index + 1}. "${tweet.text}" | ${tweet.handle} | ${tweet.url}`).join('\n')}

Rules:
1. Skip tweets with <4 meaningful words
2. For valid tweets: write brief connection + 5 witty replies (≤280 chars each)
3. Mix standalone insights and @mentions
4. Return JSON array: [{"originalTweet":"text","tweetHandle":"@handle","tweetUrl":"url","connection":"brief","replies":["r1","r2","r3","r4","r5"]}]

Tone: Insightful, witty, sarcastic.`;

  if (isWindows) {
    // Use Anthropic API for Windows
    return await generateConnectionsWithAPI(prompt, topic1, tweets, logEntry);
  } else {
    // Use Claude CLI for Mac/Linux
    return await generateConnectionsWithCLI(prompt, topic1, tweets, logEntry);
  }
}

// Windows: Use Anthropic API for connections
async function generateConnectionsWithAPI(prompt, topic1, tweets, logEntry) {
  const Anthropic = require('@anthropic-ai/sdk');
  
  let content = '';
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    console.log(`📝 Sending prompt to Claude API (${prompt.length} characters)`);
    
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
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
    
    // Extract JSON from the response with better error handling
    let jsonContent = content;
    let result;
    
    try {
      // First try to find JSON in code blocks
      const codeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1];
      } else {
        // Try to find JSON array
        const arrayMatch = content.match(/(\[[\s\S]*\])/);
        if (arrayMatch) {
          jsonContent = arrayMatch[1];
        } else {
          // Try to find JSON object
          const jsonMatch = content.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            jsonContent = jsonMatch[1];
          }
        }
      }
      
      // Try to parse the extracted JSON
      result = JSON.parse(jsonContent);
      
    } catch (parseError) {
      console.warn(`❌ Initial JSON parsing failed: ${parseError.message}`);
      
      // If parsing fails, try to fix common truncation issues
      try {
        // Look for incomplete JSON and try to complete it
        const incompleteArrayMatch = content.match(/(\[[\s\S]*?)(?:\s*$|\s*\n)/);
        if (incompleteArrayMatch) {
          let incompleteJson = incompleteArrayMatch[1];
          
          // Count opening and closing brackets/braces
          const openBrackets = (incompleteJson.match(/\[/g) || []).length;
          const closeBrackets = (incompleteJson.match(/\]/g) || []).length;
          const openBraces = (incompleteJson.match(/\{/g) || []).length;
          const closeBraces = (incompleteJson.match(/\}/g) || []).length;
          
          // Add missing closing brackets/braces
          while (closeBrackets < openBrackets) {
            incompleteJson += ']';
          }
          while (closeBraces < openBraces) {
            incompleteJson += '}';
          }
          
          console.log(`🔧 Attempting to fix truncated JSON: ${incompleteJson.substring(0, 100)}...`);
          result = JSON.parse(incompleteJson);
          
        } else {
          throw new Error('Could not extract or fix JSON content');
        }
      } catch (fixError) {
        console.warn(`❌ JSON fix attempt failed: ${fixError.message}`);
        console.warn(`Raw content preview: ${content.substring(0, 500)}...`);
        throw parseError; // Re-throw original error
      }
    }
    
    // Enhance Claude results with original tweet metadata
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
    
    console.log(`🎯 Successfully generated ${enhancedResult.length} sets of replies`);
    writeConnectionLog(logEntry);
    return enhancedResult;
    
  } catch (error) {
    if (error.name === 'SyntaxError') {
      console.warn(`❌ Failed to parse Claude response: ${error.message}`);
      console.warn(`Raw output: ${content ? content.substring(0, 200) : 'No content'}...`);
      logEntry.result = 'parse_failed';
      logEntry.parseError = error.message;
    } else {
      console.warn(`❌ Claude API error: ${error.message}`);
      logEntry.result = 'api_failed';
      logEntry.apiError = error.message;
    }
    logEntry.fallbackUsed = true;
    writeConnectionLog(logEntry);
    return generateFallbackData(topic1, tweets);
  }
}

// Mac/Linux: Use Claude CLI for connections
async function generateConnectionsWithCLI(prompt, topic1, tweets, logEntry) {
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
      logEntry.claudeExitCode = code;
      logEntry.claudeOutput = output.substring(0, 500) + (output.length > 500 ? '...' : '');
      logEntry.claudeError = errorOutput;
      
      if (code !== 0) {
        console.warn(`❌ Claude CLI exited with code ${code}`);
        console.warn(`Error output: ${errorOutput}`);
        logEntry.result = 'failed';
        logEntry.fallbackUsed = true;
        
        // Write log and use fallback
        writeConnectionLog(logEntry);
        resolve(generateFallbackData(topic1, tweets));
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
          const jsonMatch = content.match(/(\[[\s\S]*\])/);
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
          logEntry.result = 'parse_failed';
          logEntry.parseError = parseError.message;
          logEntry.fallbackUsed = true;
          writeConnectionLog(logEntry);
          resolve(generateFallbackData(topic1, tweets));
          return;
        }
        // Enhance Claude results with original tweet metadata
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
        console.log(`🎯 Successfully generated ${enhancedResult.length} sets of replies`);
        writeConnectionLog(logEntry);
        resolve(enhancedResult);
      } catch (parseError) {
        console.warn(`❌ Failed to parse Claude response: ${parseError.message}`);
        console.warn(`Full raw output for debugging: ${output}`);
        logEntry.result = 'parse_failed';
        logEntry.parseError = parseError.message;
        logEntry.fallbackUsed = true;
        writeConnectionLog(logEntry);
        resolve(generateFallbackData(topic1, tweets));
      }
    });
    
    claude.on('error', (error) => {
      console.warn(`❌ Claude CLI error: ${error.message}`);
      
      logEntry.result = 'spawn_failed';
      logEntry.spawnError = error.message;
      logEntry.fallbackUsed = true;
      
      writeConnectionLog(logEntry);
      resolve(generateFallbackData(topic1, tweets));
    });
  });
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