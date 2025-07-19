require('dotenv').config();
const { google } = require('googleapis');
const puppeteer = require('puppeteer');
const { analyzeTweet } = require('./claude');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
// Topic-specific file naming
function getTopicFiles(topic) {
  return {
    LAST_ROW_FILE: `.${topic}_last_row.txt`,
    LOCK_FILE: `.${topic}_monitor.lock`,
    PID_FILE: `.${topic}_monitor.pid`,
    LOG_FILE: `${topic}_monitor.log`,
    LAST_SHEET_ID_FILE: `.${topic}_last_sheet_id.txt`
  };
}

// Get topic from environment
const TOPIC = process.env.TOPIC || 'ethereum';
const FILES = getTopicFiles(TOPIC);
const LAST_ROW_FILE = FILES.LAST_ROW_FILE;
const LOCK_FILE = FILES.LOCK_FILE;
let isProcessing = false;
let cronTask = null;

const RELEVANT_SHEET = 'Sheet1';

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

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || 'service-account-key.json',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file'
    ],
  });
  return auth.getClient();
}

async function getLatestTweetsSpreadsheet(auth) {
  const config = getConfig();
  const drive = google.drive({ version: 'v3', auth });
  // List all spreadsheets accessible to the service account
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed = false",
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50
  });
  const files = res.data.files || [];
  // Find the most recent file whose name matches the prefix
  const candidates = files.filter(f => f.name.startsWith(config.sheetPrefix));
  if (candidates.length === 0) return null;
  // Return the most recently modified
  return candidates[0];
}

async function findTargetSpreadsheet(auth, config) {
  const drive = google.drive({ version: 'v3', auth });
  // Search for the target sheet by name in the specified folder
  const res = await drive.files.list({
    q: `name='${config.targetSheet}' and '${config.folder}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: 10
  });
  const files = res.data.files || [];
  return files.length > 0 ? files[0].id : null;
}

async function getLatestTweetsSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  // Just pick the first (or only) tab, regardless of its name
  return meta.data.sheets[0]?.properties.title;
}

function toUTC8(dateStr) {
  // Example input: "June 24, 2025 at 07:34AM" or "June 24, 2025 at 07:34 AM"
  let d;
  if (dateStr.includes('at')) {
    let [date, time] = dateStr.split(' at ');
    // Ensure there is a space before AM/PM
    time = time.replace(/(\d{1,2}:\d{2})\s?(AM|PM)/i, '$1 $2');
    // Parse as local time (not UTC)
    d = new Date(`${date} ${time}`);
  } else {
    d = new Date(dateStr);
  }
  if (isNaN(d.getTime())) {
    d = new Date(Date.parse(dateStr));
  }
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  
  // Convert to UTC+8 by adding 8 hours to the local time
  const utc8Time = new Date(d.getTime() + (8 * 60 * 60 * 1000));
  
  // Format as UTC+8
  const options = { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila' // UTC+8 timezone
  };
  
  return utc8Time.toLocaleString('en-US', options);
}

async function getFollowerCount(handle) {
  let browser = null;
  let page = null;
  
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222'
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1, height: 1 }); // Minimize visibility
    
    await page.goto(`https://x.com/${handle.replace(/^@/, '')}`, { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait for the followers element
    await page.waitForSelector('a[href*="verified_followers"] span > span', { timeout: 15000 });

    const followersText = await page.$eval(
      'a[href*="verified_followers"] span > span',
      el => el.textContent.trim()
    );

    // Convert followers count text to number
    let followersCount = 0;
    if (followersText.toLowerCase().endsWith('k')) {
      followersCount = parseFloat(followersText.toLowerCase().replace('k', '')) * 1000;
    } else if (followersText.toLowerCase().endsWith('m')) {
      followersCount = parseFloat(followersText.toLowerCase().replace('m', '')) * 1000000;
    } else {
      followersCount = parseInt(followersText.replace(/,/g, ''), 10);
    }
    
    return Math.round(followersCount) || 0;
    
  } catch (e) {
    console.error(`Failed to load profile for ${handle}:`, e.message);
    return 0; // Return 0 as fallback
  } finally {
    // Safely close page and browser
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (closeError) {
      console.error(`Error closing page for ${handle}:`, closeError.message);
    }
    
    try {
      if (browser && browser.connected) {
        await browser.disconnect();
      }
    } catch (disconnectError) {
      console.error(`Error disconnecting browser for ${handle}:`, disconnectError.message);
    }
  }
}

async function processNewRows() {
  if (isProcessing) {
    console.log('Already processing, skipping...');
    return;
  }
  isProcessing = true;
  
  try {
    const config = getConfig();
    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
  
    // Find the latest tweets spreadsheet file
    const latestFile = await getLatestTweetsSpreadsheet(auth);
    if (!latestFile) {
      console.log(`No ${config.sheetPrefix} spreadsheet file found.`);
      return;
    }
  
    const spreadsheetId = latestFile.id;
  
    // Reset topic-specific last_row file if a new sheet is detected
    const LAST_SHEET_ID_FILE = FILES.LAST_SHEET_ID_FILE;
    let lastSheetId = '';
    if (fs.existsSync(LAST_SHEET_ID_FILE)) {
      lastSheetId = fs.readFileSync(LAST_SHEET_ID_FILE, 'utf8');
    }
    if (spreadsheetId !== lastSheetId) {
      fs.writeFileSync(LAST_ROW_FILE, '0');
      fs.writeFileSync(LAST_SHEET_ID_FILE, spreadsheetId);
    }
  
    const latestSheet = await getLatestTweetsSheet(sheets, spreadsheetId);
    if (!latestSheet) {
      console.log(`No ${config.sheetPrefix} sheet/tab found in the latest file.`);
      return;
    }
  
    // Get all data
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${latestSheet}!A:D`
    });
    const rows = res.data.values || [];
    if (rows.length === 0) return; // No data

    let lastProcessedRow = 0;
    if (fs.existsSync(LAST_ROW_FILE)) {
      lastProcessedRow = parseInt(fs.readFileSync(LAST_ROW_FILE, 'utf8'), 10);
    }

    // Get already processed (Relevant Tweets) to avoid duplicates
    const targetSpreadsheetId = await findTargetSpreadsheet(auth, config);
    if (!targetSpreadsheetId) {
      console.log(`Target sheet "${config.targetSheet}" not found in folder`);
      return;
    }
    const relevantRes = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSpreadsheetId,
      range: `${RELEVANT_SHEET}!A:E`
    });
    const relevantRows = relevantRes.data.values || [];
    const processedSet = new Set(relevantRows.map(r => r[3])); // Use tweet link as unique key

    // Only process each new row once per run
    console.log(`Starting to process rows ${lastProcessedRow + 1} to ${rows.length}...`);
    for (let i = lastProcessedRow; i < rows.length; i++) {
      console.log(`Processing row ${i + 1}: ${rows[i] ? rows[i][1] : 'undefined'}`);
      const [createdAt, handle, tweetText, tweetLink] = rows[i];
      if (processedSet.has(tweetLink)) {
        console.log(`Row ${i + 1} already processed, skipping...`);
        // Update last processed row even for duplicates
        fs.writeFileSync(LAST_ROW_FILE, (i + 1).toString());
        continue;
      }

      console.log(`Getting follower count for ${handle}...`);
      const followerCount = await Promise.race([
        getFollowerCount(handle),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
      ]).catch(e => {
        console.log(`Failed to get follower count for ${handle}: ${e.message}`);
        return 0;
      });
      console.log(`Follower count for ${handle}: ${followerCount}`);
      
      // Use follower override if provided, otherwise use config default
      const effectiveFollowerThreshold = process.env.FOLLOWER_OVERRIDE 
        ? parseInt(process.env.FOLLOWER_OVERRIDE, 10) 
        : config.followersThreshold;
      
      if (followerCount <= effectiveFollowerThreshold) {
        const thresholdSource = process.env.FOLLOWER_OVERRIDE ? 'override' : 'config';
        console.log(`Tweet ${i + 1} FAIL (Follower count too low: ${followerCount} <= ${effectiveFollowerThreshold} [${thresholdSource}])`);
        // Update last processed row after processing (fail)
        fs.writeFileSync(LAST_ROW_FILE, (i + 1).toString());
        continue;
      }

      console.log(`Running AI analysis for tweet ${i + 1}...`);
      const result = await Promise.race([
        analyzeTweet(tweetText),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI analysis timeout')), 60000))
      ]).catch(e => {
        console.log(`AI analysis failed for tweet ${i + 1}: ${e.message}`);
        return 'FAIL';
      });
      console.log(`AI analysis result for tweet ${i + 1}: ${result}`);
      if (result !== 'PASS') {
        console.log(`Tweet ${i + 1} FAIL (AI analysis: ${result})`);
        // Update last processed row after processing (fail)
        fs.writeFileSync(LAST_ROW_FILE, (i + 1).toString());
        continue;
      }

      const createdAtUTC8 = toUTC8(createdAt);
      const newRow = [createdAtUTC8, handle, tweetText, tweetLink, followerCount];
      await sheets.spreadsheets.values.append({
        spreadsheetId: targetSpreadsheetId,
        range: `${RELEVANT_SHEET}!A:E`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [newRow] }
      });
      console.log(`Tweet ${i + 1} PASS`);
      console.log(`✅ Added relevant ${config.name.toLowerCase()} tweet: ${tweetLink}`);
      
      // Update last processed row after processing (pass)
      fs.writeFileSync(LAST_ROW_FILE, (i + 1).toString());
      
      // Add a delay to ensure the append operation completes before processing next tweet
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await new Promise(r => setTimeout(r, 2000)); // Avoid rate limits
    }
  } catch (error) {
    console.error('Error processing rows:', error);
  } finally {
    isProcessing = false;
  }
}

function getMonitoringStatus() {
  // Monitoring is active if the lock file exists and the process is alive
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    // Check if process is running
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // Process not running, remove stale lock file
    fs.unlinkSync(LOCK_FILE);
    return false;
  }
}

function stopMonitoring() {
  if (!fs.existsSync(LOCK_FILE)) {
    return { success: false, message: 'Monitoring is not currently running' };
  }
  
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    // Send SIGTERM to gracefully stop the process
    process.kill(pid, 'SIGTERM');
    return { success: true, message: 'Monitoring stopped successfully' };
  } catch (e) {
    // Process not running, remove stale lock file
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    return { success: false, message: 'Monitoring process was not running' };
  }
}

if (require.main === module) {
  const config = getConfig();
  
  // Create lock file to indicate monitoring is active
  fs.writeFileSync(LOCK_FILE, process.pid.toString());

  // Remove lock file on exit
  const cleanup = () => {
    console.log('Cleaning up and stopping monitoring...');
    if (cronTask) {
      cronTask.stop();
      cronTask = null;
    }
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    process.exit();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Run immediately when script is executed directly
  processNewRows();
  // Then run every 5 minutes
  cronTask = cron.schedule('*/2 * * * *', processNewRows);
  console.log(`${config.name} monitoring started. Running every 5 minutes...`);
}

module.exports = { processNewRows, getMonitoringStatus, stopMonitoring };

