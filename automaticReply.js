require('dotenv').config();
const { google } = require('googleapis');
const puppeteer = require('puppeteer');
const { generateReply } = require('./claude-reply');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

// Topic-specific file naming for automatic reply
function getTopicFiles(topic) {
  return {
    LAST_ROW_FILE: `.${topic}_relevant_row.txt`,
    LOCK_FILE: `.${topic}_reply.lock`,
    PID_FILE: `.${topic}_reply.pid`,
    LOG_FILE: `${topic}_reply.log`,
  };
}

// Get topic from environment
const TOPIC = process.env.TOPIC || 'ethereum';
const FILES = getTopicFiles(TOPIC);
const LAST_ROW_FILE = FILES.LAST_ROW_FILE;
const LOCK_FILE = FILES.LOCK_FILE;
let isProcessing = false;
let cronTask = null;
let parentMonitorInterval = null;

const RELEVANT_SHEET = 'Sheet1';

// Discord notification setup
let discordClient = null;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Initialize Discord client if credentials are available
if (DISCORD_CHANNEL_ID && DISCORD_BOT_TOKEN) {
  discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });
  
  discordClient.login(DISCORD_BOT_TOKEN).catch(err => {
    console.log('⚠️ Discord notification disabled - login failed:', err.message);
    discordClient = null;
  });
}

// Function to send Discord notification
async function sendDiscordNotification(tweetLink, replyText) {
  if (!discordClient || !DISCORD_CHANNEL_ID) {
    return;
  }
  
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel) {
      await channel.send(`**Auto Reply Posted**\nTweet Link: ${tweetLink}\nReply: ${replyText}`);
    }
  } catch (error) {
    console.log('⚠️ Failed to send Discord notification:', error.message);
  }
}

// Load configuration based on environment
function getConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  const environment = process.env.TOPIC || 'ethereum';
  if (!config[environment]) {
    throw new Error(`Configuration for topic '${environment}' not found in config.json`);
  }
  
  return config[environment];
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Clean up on process exit
function cleanup() {
  console.log('\n🛑 Cleaning up automatic reply process...');
  
  if (cronTask) {
    cronTask.destroy();
    cronTask = null;
    console.log('🧹 Destroyed cron task');
  }
  
  if (parentMonitorInterval) {
    clearInterval(parentMonitorInterval);
    parentMonitorInterval = null;
    console.log('🧹 Stopped parent process monitoring');
  }
  
  if (fs.existsSync(FILES.PID_FILE)) {
    fs.unlinkSync(FILES.PID_FILE);
    console.log(`🧹 Removed PID file: ${FILES.PID_FILE}`);
  }
  
  process.stdin.pause();
  console.log('✅ Cleanup completed');
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// Note: SIGKILL cannot be listened to - it immediately kills the process
// We only handle SIGINT and SIGTERM for graceful shutdown

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key-new.json',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
  });
  return auth;
}

/**
 * Find the target spreadsheet containing relevant tweets in the configured folder
 * @param {Object} auth - Google Auth object
 * @param {Object} config - Topic configuration
 * @returns {string|null} - Spreadsheet ID or null if not found
 */
async function findTargetSpreadsheet(auth, config) {
  try {
    const drive = google.drive({ version: 'v3', auth });
    
    // Search for the target sheet in the specified folder
    const response = await drive.files.list({
      q: `name='${config.targetSheet}' and '${config.folder}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id, name)'
    });
    
    if (response.data.files && response.data.files.length > 0) {
      console.log(`Found target sheet "${config.targetSheet}": ${response.data.files[0].id}`);
      return response.data.files[0].id;
    }
    
    console.log(`Target sheet "${config.targetSheet}" not found in folder ${config.folder}`);
    return null;
  } catch (error) {
    console.error('Error finding target spreadsheet:', error);
    return null;
  }
}

/**
 * Post a reply to a tweet using Puppeteer
 * @param {string} tweetLink - URL of the tweet to reply to
 * @param {string} replyText - The reply text to post
 * @returns {Promise<boolean>} - Success status
 */
async function postTweetReply(tweetLink, replyText) {
  let browser = null;
  let page = null;
  
  try {
    console.log(`🤖 Opening tweet: ${tweetLink}`);
    
    // Connect to existing browser instance
    try {
      browser = await puppeteer.connect({
        browserURL: 'http://127.0.0.1:9222'
      });
      console.log(`✅ Connected to browser successfully`);
    } catch (connectionError) {
      console.error(`❌ Failed to connect to browser: ${connectionError.message}`);
      console.log('💡 Make sure Chrome is running with: chrome --remote-debugging-port=9222');
      return false;
    }
    
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the tweet
    console.log(`🌐 Navigating to tweet...`);
    await page.goto(tweetLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`✅ Successfully loaded tweet page`);
    
    // Wait a moment for page to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`📝 Attempting to post reply: "${replyText}"`);
    
    // Wait for the reply text box to appear
    // CSS Selector Documentation:
    // Updated reply text box selector for better accuracy
    // Primary selector: div[contenteditable="true"] div.public-DraftStyleDefault-block
    // This targets the actual editable content area within the reply box
    const textboxSelector = 'div[contenteditable="true"] div.public-DraftStyleDefault-block';
    await page.waitForSelector(textboxSelector, { timeout: 10000 });
    
    // Click the text box first before typing (as specified)
    await page.click(textboxSelector);
    console.log(`✅ Clicked reply text box`);
    
    // Clear any existing text and type the reply
    await page.type(textboxSelector, replyText);
    
    console.log(`✅ Typed reply text: "${replyText}"`);
    
    // Wait a moment for the text to register
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Click the tweet/reply button
    // CSS Selector Documentation:
    // Updated send button selector to ensure it's enabled and has content
    // Primary selector: button[data-testid="tweetButtonInline"]:not([disabled])
    // This ensures the button is enabled and ready to send (indicating reply content exists)
    const sendButtonSelector = 'button[data-testid="tweetButtonInline"]:not([disabled])';
    await page.waitForSelector(sendButtonSelector, { timeout: 5000 });
    
    // Additional check to ensure button is truly enabled
    const isButtonEnabled = await page.$eval(sendButtonSelector, el => 
      !el.disabled && 
      el.getAttribute('aria-disabled') !== 'true' &&
      !el.classList.contains('disabled')
    );
    
    if (!isButtonEnabled) {
      console.error('❌ Send button is still disabled after typing reply');
      return false;
    }
    
    await page.click(sendButtonSelector);
    
    console.log(`✅ Clicked send button`);
    
    // Wait for the reply to be posted (page might redirect or show confirmation)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`🎉 Reply posted successfully`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error posting reply to ${tweetLink}:`, error.message);
    
    // Take a screenshot for debugging if possible
    if (page) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await page.screenshot({ 
          path: `reply-error-${timestamp}.png`,
          fullPage: true 
        });
        console.log(`📸 Error screenshot saved: reply-error-${timestamp}.png`);
      } catch (screenshotError) {
        console.error('Failed to take error screenshot:', screenshotError.message);
      }
    }
    
    return false;
  } finally {
    if (page) {
      await page.close();
    }
    // Note: Don't close browser as it might be used by other processes
  }
}

/**
 * Process relevant tweets and post replies
 */
async function processRelevantTweets() {
  if (isProcessing) {
    console.log('Already processing, skipping...');
    return;
  }

  isProcessing = true;
  
  try {
    console.log(`🚀 Starting automatic reply processing for ${TOPIC}...`);
    
    const config = getConfig();
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Find the target spreadsheet containing relevant tweets
    const targetSpreadsheetId = await findTargetSpreadsheet(auth, config);
    if (!targetSpreadsheetId) {
      console.log(`Target sheet "${config.targetSheet}" not found in folder`);
      return;
    }
    
    // Get all rows from the relevant tweets sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSpreadsheetId,
      range: `${RELEVANT_SHEET}!A:E` // A-DateTime, B-Handle, C-TweetText, D-TweetLink, E-FollowerCount
    });
    
    const rows = res.data.values || [];
    if (rows.length === 0) {
      console.log('No data found in relevant tweets sheet');
      return;
    }
    
    // Use all rows since there are no headers in the relevant tweets sheet
    const dataRows = rows;
    if (dataRows.length === 0) {
      console.log('No data rows found in sheet');
      return;
    }
    
    // Get last processed row
    let lastProcessedRow = 0;
    if (fs.existsSync(LAST_ROW_FILE)) {
      lastProcessedRow = parseInt(fs.readFileSync(LAST_ROW_FILE, 'utf8'), 10);
    }
    
    console.log(`📊 Found ${dataRows.length} relevant tweets, last processed row: ${lastProcessedRow}`);
    
    // Process new rows
    // DIMPLE 
    //for (let i = lastProcessedRow; i < dataRows.length; i++) {
    for (let i = lastProcessedRow; i < 3; i++) {
      const rowNumber = i + 1; // Row number in sheet (1-based)
      console.log(`\n🔄 Processing tweet ${rowNumber}/${dataRows.length}...`);
      
      const [dateTime, handle, tweetText, tweetLink, followerCount] = dataRows[i];
      
      if (!tweetLink || !handle || !tweetText) {
        console.log(`❌ Incomplete data for row ${rowNumber}, skipping...`);
        fs.writeFileSync(LAST_ROW_FILE, rowNumber.toString());
        continue;
      }
      
      console.log(`📱 Tweet by @${handle}: "${tweetText.substring(0, 100)}${tweetText.length > 100 ? '...' : ''}"`);
      console.log(`🔗 Link: ${tweetLink}`);
      
      // Generate reply using AI
      console.log(`🤖 Generating reply for tweet ${rowNumber}...`);
      const replyText = await generateReply(tweetText, handle, config.name);
      
      if (!replyText || replyText.trim().length === 0) {
        console.log(`❌ Failed to generate reply for tweet ${rowNumber}`);
        fs.writeFileSync(LAST_ROW_FILE, rowNumber.toString());
        continue;
      }
      
      console.log(`💬 Generated reply: "${replyText}"`);
      
      // Post the reply
      const success = await postTweetReply(tweetLink, replyText);
      
      if (success) {
        console.log(`✅ Tweet ${rowNumber} Successfully Posted Reply.`);
        // Send Discord notification
        await sendDiscordNotification(tweetLink, replyText);
      } else {
        console.log(`❌ Failed to post reply for tweet ${rowNumber}`);
      }
      
      // Update last processed row regardless of success/failure
      fs.writeFileSync(LAST_ROW_FILE, rowNumber.toString());
      
      // Add delay between replies to avoid rate limits and seem more natural
      console.log(`⏱️ Waiting 30 seconds before next reply...`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    console.log(`\n🎉 Automatic reply processing completed for ${TOPIC}`);
    
  } catch (error) {
    console.error('❌ Error processing relevant tweets:', error);
  } finally {
    isProcessing = false;
  }
}

// Monitor parent process and exit if parent dies
function monitorParentProcess() {
  const parentPid = process.ppid;
  
  // Check parent process every 30 seconds
  const parentCheckInterval = setInterval(() => {
    try {
      // Check if parent process is still alive
      process.kill(parentPid, 0); // Signal 0 just checks if process exists
    } catch (error) {
      if (error.code === 'ESRCH') {
        console.log(`🛑 Parent process (PID ${parentPid}) no longer exists. Shutting down automatic reply...`);
        cleanup();
        process.exit(0);
      }
    }
  }, 30000); // Check every 30 seconds
  
  return parentCheckInterval;
}

// Start cron job for automatic processing
function startAutomaticReply() {
  if (cronTask) {
    console.log('Automatic reply is already running');
    return;
  }
  
  console.log(`🚀 Starting automatic reply for ${TOPIC}...`);
  console.log(`👨‍👩‍👧‍👦 Parent process PID: ${process.ppid}`);
  
  // Start monitoring parent process
  parentMonitorInterval = monitorParentProcess();
  
  // Create PID file for tracking
  fs.writeFileSync(FILES.PID_FILE, process.pid.toString());
  console.log(`📝 Created PID file: ${FILES.PID_FILE} with PID: ${process.pid}`);
  
  // Keep process alive FIRST, before any async operations
  process.stdin.resume();
  
  // Run every 5 minutes
  cronTask = cron.schedule('*/5 * * * *', () => {
    console.log(`⏰ [${new Date().toISOString()}] Running automatic reply check for ${TOPIC}...`);
    processRelevantTweets();
  });
  
  // Run initial processing immediately (async to prevent blocking)
  setTimeout(async () => {
    try {
      console.log(`🚀 Starting initial automatic reply processing for ${TOPIC}...`);
      await processRelevantTweets();
    } catch (error) {
      console.error(`❌ Initial processing error: ${error.message}`);
      // Don't crash the daemon on error - just log and continue
    }
  }, 3000); // Start processing quickly after daemon is stable
  
  console.log(`✅ Automatic reply started for ${TOPIC} (runs every 5 minutes)`);
}

function stopAutomaticReply() {
  console.log(`🛑 Stopping automatic reply for ${TOPIC}...`);
  
  // Ensure proper cleanup
  cleanup();
  
  console.log(`✅ Automatic reply stopped for ${TOPIC}`);
}

// Export functions and handle direct script execution
module.exports = {
  startAutomaticReply,
  stopAutomaticReply,
  processRelevantTweets,
  postTweetReply
};

// Handle direct script execution
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      startAutomaticReply();
      // Keep the process alive - don't exit after starting cron
      console.log('🔄 Process will continue running in background...');
      break;
    case 'stop':
      stopAutomaticReply();
      process.exit(0);
      break;
    case 'process':
      processRelevantTweets().then(() => process.exit(0));
      break;
    default:
      console.log('Usage: node automaticReply.js {start|stop|process}');
      console.log('  start   - Start automatic reply monitoring');
      console.log('  stop    - Stop automatic reply monitoring');
      console.log('  process - Process relevant tweets once');
      process.exit(1);
  }
}

