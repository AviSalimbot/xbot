require('dotenv').config();
const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { generateReply } = require('./claude-reply');

// Import the analyzeTweet function from claude.js
const { analyzeTweet } = require('./claude');
// Import the getFollowerCount function from monitorRelevantTweets.js
const { getFollowerCount } = require('./monitorRelevantTweets');
// Import the postTweetReply function from automaticReply.js
const { postTweetReply } = require('./automaticReply');

// Topic-specific file naming for monitoring
function getTopicFiles(topic) {
  return {
    LAST_ROW_FILE: `.${topic}_monitor_row.txt`,
    LOCK_FILE: `.${topic}_monitor.lock`,
    PID_FILE: `.${topic}_monitor_alert.pid`,
    LOG_FILE: `${topic}_monitor_alert.log`,
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

// Function to send Discord monitor alert (new format)
async function sendDiscordMonitorAlert(tweetLink, replyText) {
  if (!discordClient || !DISCORD_CHANNEL_ID) {
    return;
  }
  
  try {
    const channel = await discordClient.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel) {
      await channel.send(`**New Post Alert!**\nTweet Link: ${tweetLink}\nReply: ${replyText}`);
    }
  } catch (error) {
    console.log('⚠️ Failed to send Discord monitor alert:', error.message);
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
  console.log('\n🛑 Cleaning up monitor alert process...');
  
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
  
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
    console.log(`🧹 Removed lock file: ${LOCK_FILE}`);
  }
  
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Function to check for parent process termination (optional monitoring)
function startParentMonitoring() {
  if (process.env.PARENT_PID) {
    const parentPid = parseInt(process.env.PARENT_PID);
    parentMonitorInterval = setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch (err) {
        console.log('🚨 Parent process terminated, shutting down monitor alerts...');
        cleanup();
      }
    }, 5000);
  }
}

// Function to get next unprocessed row
function getNextRowToProcess() {
  let lastRow = 0;
  if (fs.existsSync(LAST_ROW_FILE)) {
    const content = fs.readFileSync(LAST_ROW_FILE, 'utf8').trim();
    if (content) {
      lastRow = parseInt(content, 10);
    }
  }
  return lastRow;
}

// Function to update last processed row
function updateLastProcessedRow(rowNumber) {
  fs.writeFileSync(LAST_ROW_FILE, rowNumber.toString());
}

// Main function to monitor tweets and send alerts
async function monitorTweetsForAlerts() {
  if (isProcessing) {
    console.log('⏳ Monitor alert already processing, skipping this iteration');
    return;
  }

  // Check for lock file
  if (fs.existsSync(LOCK_FILE)) {
    console.log('🔒 Lock file exists, another instance may be running');
    return;
  }

  isProcessing = true;
  fs.writeFileSync(LOCK_FILE, process.pid.toString());

  try {
    console.log(`🚀 Starting monitor alert check for topic: ${TOPIC}`);
    
    const config = getConfig();
    console.log(`📋 Loaded config for ${config.name}`);

    // Set up Google Sheets API
    const auth = new google.auth.GoogleAuth({
      keyFile: 'service-account-key-new.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly', 'https://www.googleapis.com/auth/drive.readonly']
    });

    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the LATEST raw Twitter collection spreadsheet (same as start monitoring)
    console.log(`🔍 Looking for latest raw Twitter collection sheet with prefix: ${config.sheetPrefix}`);
    
    const driveResponse = await drive.files.list({
      q: `name contains '${config.sheetPrefix}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    if (!driveResponse.data.files || driveResponse.data.files.length === 0) {
      console.log(`❌ No raw Twitter collection sheets found with prefix "${config.sheetPrefix}"`);
      return;
    }

    // Get the most recently modified spreadsheet (latest Twitter data)
    const latestSpreadsheet = driveResponse.data.files[0];
    const spreadsheetId = latestSpreadsheet.id;
    console.log(`✅ Found latest raw Twitter collection: ${latestSpreadsheet.name} (${spreadsheetId})`);

    // Get the data from the raw Twitter collection sheet
    const range = `${RELEVANT_SHEET}!A:D`; // Raw data: [createdAt, handle, tweetText, tweetLink]
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('❌ No tweet data found in raw Twitter collection sheet');
      return;
    }

    // Get the next row to process
    let lastProcessedRow = getNextRowToProcess();
    console.log(`📍 Last processed row: ${lastProcessedRow}`);
    console.log(`📊 Total rows in raw sheet: ${rows.length}`);

    let newPostsFound = 0;

    // Process new rows (start from lastProcessedRow + 1)
    for (let i = lastProcessedRow; i < rows.length; i++) {
      const rowNumber = i + 1;
      const [createdAt, handle, tweetText, tweetLink] = rows[i]; // No followerCount in raw data
      
      if (!tweetText || !handle || !tweetLink) {
        console.log(`⚠️ Row ${rowNumber} missing required data, skipping`);
        continue;
      }

      console.log(`\n🔍 Processing row ${rowNumber}:`);
      console.log(`   Handle: @${handle}`);
      console.log(`   Tweet: ${tweetText.substring(0, 100)}...`);
      console.log(`   Link: ${tweetLink}`);

      // Apply the same AI and follower filtering as the regular monitoring
      try {
        // AI analysis check first (faster than follower lookup)
        console.log('🤖 Running AI analysis...');
        const aiResult = await analyzeTweet(tweetText);
        if (aiResult !== 'PASS') {
          console.log(`❌ Row ${rowNumber} FAILED AI analysis: ${aiResult}`);
          updateLastProcessedRow(rowNumber);
          continue;
        }
        console.log(`✅ Row ${rowNumber} PASSED AI analysis`);

        // Get follower count from Twitter profile
        console.log('👥 Fetching follower count...');
        const followerCount = await getFollowerCount(handle);
        console.log(`   Followers: ${followerCount}`);

        // Follower count check
        const followerThreshold = parseInt(process.env.FOLLOWER_OVERRIDE) || config.followersThreshold || 2000;
        
        if (followerCount <= followerThreshold) {
          console.log(`❌ Row ${rowNumber} FAILED follower check: ${followerCount} <= ${followerThreshold}`);
          updateLastProcessedRow(rowNumber);
          continue;
        }
        console.log(`✅ Row ${rowNumber} PASSED follower check: ${followerCount} > ${followerThreshold}`);

        // Tweet passed both filters! Generate AI reply and send Discord alert
        console.log(`🎯 Row ${rowNumber} PASSED ALL FILTERS - Generating reply...`);
        
        const replyText = await generateReply(tweetText, handle, config.name);
        
        if (!replyText || replyText.trim().length === 0) {
          console.log(`⚠️ Row ${rowNumber} failed to generate reply`);
          updateLastProcessedRow(rowNumber);
          continue;
        }

        console.log(`✅ Row ${rowNumber} generated reply: ${replyText.substring(0, 100)}...`);

        // Post the reply to Twitter
        console.log(`🐦 Row ${rowNumber} posting reply to Twitter...`);
        const postSuccess = await postTweetReply(tweetLink, replyText);
        
        if (postSuccess) {
          console.log(`✅ Row ${rowNumber} REPLY POSTED TO TWITTER!`);
          // Send Discord alert only if reply was successfully posted
          await sendDiscordMonitorAlert(tweetLink, replyText);
          newPostsFound++;
          console.log(`🚨 Row ${rowNumber} MONITOR ALERT SENT!`);
        } else {
          console.log(`❌ Row ${rowNumber} failed to post reply to Twitter - skipping Discord alert`);
        }
        
        // Update last processed row
        updateLastProcessedRow(rowNumber);
        
      } catch (error) {
        console.error(`❌ Error processing row ${rowNumber}:`, error);
        updateLastProcessedRow(rowNumber);
        continue;
      }
    }

    if (newPostsFound === 0) {
      console.log('📭 No new filtered tweets found this iteration');
    } else {
      console.log(`🎉 Sent ${newPostsFound} monitor alerts this iteration`);
    }

  } catch (error) {
    console.error('❌ Error in monitor alerts:', error);
  } finally {
    // Clean up
    isProcessing = false;
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
    console.log(`✅ Monitor alert check completed for topic: ${TOPIC}\n`);
  }
}

// Command line argument handling
const args = process.argv.slice(2);
const command = args[0];

if (command === 'start') {
  console.log(`🚀 Starting monitor alerts for topic: ${TOPIC}`);
  
  // Write PID file
  fs.writeFileSync(FILES.PID_FILE, process.pid.toString());
  console.log(`📝 PID file written: ${FILES.PID_FILE} (${process.pid})`);
  
  // Start parent process monitoring if needed
  startParentMonitoring();
  
  // Run immediately once
  monitorTweetsForAlerts().then(() => {
    // Set up cron job to run every 2 minutes
    console.log('⏰ Setting up cron job to run every 2 minutes');
    cronTask = cron.schedule('*/2 * * * *', () => {
      monitorTweetsForAlerts();
    }, {
      scheduled: true
    });
    
    console.log(`✅ Monitor alerts started for topic: ${TOPIC}`);
  });
  
} else if (command === 'stop') {
  console.log(`🛑 Stopping monitor alerts for topic: ${TOPIC}`);
  cleanup();
  
} else {
  console.log('Usage: node monitorTweets.js [start|stop]');
  console.log('Environment variables:');
  console.log('  TOPIC - Topic to monitor (default: ethereum)');
  console.log('  DISCORD_CHANNEL_ID - Discord channel for alerts');
  console.log('  DISCORD_BOT_TOKEN - Discord bot token');
  process.exit(1);
}